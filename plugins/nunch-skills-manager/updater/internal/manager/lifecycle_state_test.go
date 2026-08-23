package manager

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

func Test_LifecyclePaths_uses_stable_shared_data_directory(t *testing.T) {
	// Given
	codexHome := filepath.Join(t.TempDir(), ".codex")

	// When
	paths := NewLifecyclePaths(codexHome)

	// Then
	wantRoot := filepath.Join(codexHome, "plugins", "data", "nunch-skills")
	if paths.Root != wantRoot ||
		paths.State != filepath.Join(wantRoot, "lifecycle.json") ||
		paths.Lock != filepath.Join(wantRoot, "lifecycle.lock") {
		t.Fatalf("NewLifecyclePaths() = %#v", paths)
	}
}

func Test_LifecycleStore_Save_then_Load_preserves_ownership_and_operation(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "data", "lifecycle.json")
	store := NewLifecycleStore(path)
	want := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources: []OwnedResource{
			{
				Kind: ResourcePlugin, Name: "git-tools", Ownership: OwnershipCreated,
				PreStateFingerprint: "sha256:before",
			},
			{
				Kind: ResourceMarketplace, Name: "nunch-skills", Ownership: OwnershipPreExisting,
				PreStateFingerprint: "sha256:market",
			},
		},
		Operation: &LifecycleOperation{
			ID: "op-1", Kind: OperationUpdate, Phase: PhaseTrust,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
		LastKnownGood: &ReleaseState{Version: "0.3.0", Commit: "0123456789012345678901234567890123456789"},
	}

	// When
	if err := store.Save(want); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	got, err := store.Load()
	// Then
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !equalLifecycleState(got, want) {
		t.Fatalf("Load() = %#v, want %#v", got, want)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat() error = %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("state mode = %o, want 600", info.Mode().Perm())
	}
}

func Test_LifecycleStore_Load_rejects_unknown_schema(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "lifecycle.json")
	if err := os.WriteFile(path, []byte(`{"schemaVersion":2,"resources":[]}`), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	_, err := NewLifecycleStore(path).Load()

	// Then
	if !errors.Is(err, ErrUnsupportedLifecycleSchema) {
		t.Fatalf("Load() error = %v, want ErrUnsupportedLifecycleSchema", err)
	}
}

func Test_NewOwnedResource_rejects_created_promotion_of_preexisting_resource(t *testing.T) {
	// Given
	previous := &OwnedResource{
		Kind: ResourcePlugin, Name: "git-tools", Ownership: OwnershipPreExisting,
		PreStateFingerprint: "sha256:before",
	}

	// When
	_, err := NewOwnedResource(ResourcePlugin, "git-tools", OwnershipCreated, "sha256:after", previous)

	// Then
	if !errors.Is(err, ErrOwnershipPromotion) {
		t.Fatalf("NewOwnedResource() error = %v, want ErrOwnershipPromotion", err)
	}
}

func Test_NewOwnedResource_preserves_safe_ownership_transitions(t *testing.T) {
	// Given
	tests := []struct {
		name     string
		previous Ownership
		next     Ownership
		wantErr  error
	}{
		{name: "created remains created", previous: OwnershipCreated, next: OwnershipCreated},
		{name: "adopted remains adopted", previous: OwnershipAdopted, next: OwnershipAdopted},
		{name: "pre-existing remains pre-existing", previous: OwnershipPreExisting, next: OwnershipPreExisting},
		{name: "pre-existing may be explicitly adopted", previous: OwnershipPreExisting, next: OwnershipAdopted},
		{
			name: "created cannot become adopted", previous: OwnershipCreated,
			next: OwnershipAdopted, wantErr: ErrOwnershipTransition,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			previous := &OwnedResource{
				Kind: ResourcePlugin, Name: "git-tools", Ownership: test.previous,
				PreStateFingerprint: "sha256:before",
			}

			// When
			got, err := NewOwnedResource(ResourcePlugin, "git-tools", test.next, "sha256:before", previous)

			// Then
			if test.wantErr != nil {
				if !errors.Is(err, test.wantErr) {
					t.Fatalf("NewOwnedResource() error = %v, want %v", err, test.wantErr)
				}
				return
			}
			if err != nil || got.Ownership != test.next {
				t.Fatalf("NewOwnedResource() = %#v, %v", got, err)
			}
		})
	}
}

func Test_AdvanceLifecycleOperation_rejects_phase_regression(t *testing.T) {
	// Given
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{},
		Operation: &LifecycleOperation{
			ID: "op-1", Kind: OperationUpdate, Phase: PhaseTrust,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
	}

	// When
	_, err := AdvanceLifecycleOperation(state, PhasePlugins)

	// Then
	if !errors.Is(err, ErrInvalidOperationTransition) {
		t.Fatalf("AdvanceLifecycleOperation() error = %v, want ErrInvalidOperationTransition", err)
	}
}

func Test_BeginLifecycleOperation_rejects_overlapping_operation(t *testing.T) {
	// Given
	startedAt := time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC)
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{},
		Operation: &LifecycleOperation{
			ID: "op-1", Kind: OperationInstall, Phase: PhasePrepared, StartedAt: startedAt,
		},
	}
	next := LifecycleOperation{ID: "op-2", Kind: OperationUpdate, Phase: PhasePrepared, StartedAt: startedAt}

	// When
	_, err := BeginLifecycleOperation(state, next)

	// Then
	if !errors.Is(err, ErrInvalidOperationTransition) {
		t.Fatalf("BeginLifecycleOperation() error = %v, want ErrInvalidOperationTransition", err)
	}
}

func Test_CompleteLifecycleOperation_records_last_known_good(t *testing.T) {
	// Given
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{},
		Operation: &LifecycleOperation{
			ID: "op-1", Kind: OperationUpdate, Phase: PhaseVerify,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
	}
	release := ReleaseState{Version: "0.4.0", Commit: "abcdef0123456789abcdef0123456789abcdef01"}

	// When
	got, err := CompleteLifecycleOperation(state, release)
	// Then
	if err != nil {
		t.Fatalf("CompleteLifecycleOperation() error = %v", err)
	}
	if got.Operation != nil || got.LastKnownGood == nil || *got.LastKnownGood != release {
		t.Fatalf("CompleteLifecycleOperation() = %#v", got)
	}
}

func Test_CompleteLifecycleRollback_preserves_last_known_good(t *testing.T) {
	// Given
	release := ReleaseState{Version: "0.3.0", Commit: "abcdef0123456789abcdef0123456789abcdef01"}
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{},
		Operation: &LifecycleOperation{
			ID: "op-1", Kind: OperationUpdate, Phase: PhaseRollback,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
		LastKnownGood: &release,
	}

	// When
	got, err := CompleteLifecycleRollback(state)
	// Then
	if err != nil {
		t.Fatalf("CompleteLifecycleRollback() error = %v", err)
	}
	if got.Operation != nil || got.LastKnownGood == nil || *got.LastKnownGood != release {
		t.Fatalf("CompleteLifecycleRollback() = %#v", got)
	}
}

func equalLifecycleState(got, want LifecycleState) bool {
	if got.SchemaVersion != want.SchemaVersion || len(got.Resources) != len(want.Resources) {
		return false
	}
	if got.Resources[0] != want.Resources[0] || got.Resources[1] != want.Resources[1] {
		return false
	}
	operationsEqual := reflect.DeepEqual(got.Operation, want.Operation)
	releasesEqual := got.LastKnownGood != nil &&
		want.LastKnownGood != nil &&
		*got.LastKnownGood == *want.LastKnownGood
	return operationsEqual && releasesEqual
}
