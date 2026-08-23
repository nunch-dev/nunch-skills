package manager

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

var errInjectedReleaseStage = errors.New("injected release stage failure")

type autoReleaseStage string

const (
	autoStageSnapshot          autoReleaseStage = "snapshot"
	autoStageMarketplacePinned autoReleaseStage = "marketplace-pinned"
	autoStagePluginsUpdated    autoReleaseStage = "plugins-updated"
	autoStageTrustUpdated      autoReleaseStage = "trust-updated"
	autoStageVerifiedFinal     autoReleaseStage = "verified-final"
	autoStageRollback          autoReleaseStage = "rollback"
)

type memoryLifecycleStore struct {
	state   LifecycleState
	history []LifecycleState
	saves   int
	failAt  int
}

func (store *memoryLifecycleStore) Load() (LifecycleState, error) { return store.state, nil }

func (store *memoryLifecycleStore) Save(state LifecycleState) error {
	store.saves++
	if store.saves == store.failAt {
		return errInjectedReleaseStage
	}
	store.state = state
	store.history = append(store.history, state)
	return nil
}

type fakeVerifiedReleaseSource struct {
	candidate AutoReleaseCandidate
	found     bool
	err       error
	calls     int
}

func (source *fakeVerifiedReleaseSource) DiscoverAndVerify(
	_ context.Context,
	_ *ReleaseState,
) (AutoReleaseCandidate, bool, error) {
	source.calls++
	return source.candidate, source.found, source.err
}

type fakeReleaseMutator struct {
	version   string
	failStage autoReleaseStage
	calls     []string
}

func (mutator *fakeReleaseMutator) Snapshot(_ context.Context, operationID string) error {
	mutator.calls = append(mutator.calls, "snapshot:"+operationID)
	return mutator.fail(autoStageSnapshot)
}

func (mutator *fakeReleaseMutator) PinMarketplace(_ context.Context, candidate AutoReleaseCandidate) error {
	mutator.calls = append(mutator.calls, "marketplace:"+candidate.Release.Version)
	return mutator.fail(autoStageMarketplacePinned)
}

func (mutator *fakeReleaseMutator) UpdatePlugin(_ context.Context, plugin AutoReleasePlugin) error {
	mutator.calls = append(mutator.calls, "plugin:"+plugin.ID)
	if err := mutator.fail(autoStagePluginsUpdated); err != nil {
		return err
	}
	mutator.version = plugin.Version
	return nil
}

func (mutator *fakeReleaseMutator) UpdateExactTrust(_ context.Context, candidate AutoReleaseCandidate) error {
	mutator.calls = append(mutator.calls, "trust:"+candidate.Release.Commit[:12])
	return mutator.fail(autoStageTrustUpdated)
}

func (mutator *fakeReleaseMutator) VerifyFinal(_ context.Context, candidate AutoReleaseCandidate) error {
	mutator.calls = append(mutator.calls, "verify:"+candidate.Release.Version)
	if err := mutator.fail(autoStageVerifiedFinal); err != nil {
		return err
	}
	if mutator.version != candidate.Release.Version {
		return errors.New("release is mixed")
	}
	return nil
}

func (mutator *fakeReleaseMutator) Commit(operationID string) error {
	mutator.calls = append(mutator.calls, "commit:"+operationID)
	return nil
}

func (mutator *fakeReleaseMutator) Rollback(_ context.Context, operationID string, release ReleaseState) error {
	mutator.calls = append(mutator.calls, "rollback:"+operationID)
	if err := mutator.fail(autoStageRollback); err != nil {
		return err
	}
	mutator.version = release.Version
	return nil
}

func (mutator *fakeReleaseMutator) fail(stage autoReleaseStage) error {
	if mutator.failStage == stage {
		return errInjectedReleaseStage
	}
	return nil
}

func Test_AutoReleaseUpdater_appliesVerifiedRelease_withManagerLastAndExactTrust(t *testing.T) {
	// Given
	root := t.TempDir()
	previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
	store := &memoryLifecycleStore{state: LifecycleState{
		SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}, LastKnownGood: &previous,
	}}
	source := &fakeVerifiedReleaseSource{found: true, candidate: releaseCandidate()}
	mutator := &fakeReleaseMutator{version: previous.Version}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: root + "/lifecycle.lock", LockStaleAfter: time.Minute,
	}, store, fixedClock{now: time.Date(2026, 8, 23, 2, 0, 0, 0, time.UTC)}, source, mutator)

	// When
	result, err := updater.Run(context.Background())
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	wantCalls := []string{
		"snapshot:auto-1.1.0-aaaaaaaaaaaa",
		"marketplace:1.1.0",
		"plugin:git-tools@nunch-skills",
		"plugin:nunch-skills-manager@nunch-skills",
		"trust:aaaaaaaaaaaa",
		"verify:1.1.0",
		"commit:auto-1.1.0-aaaaaaaaaaaa",
	}
	if !reflect.DeepEqual(mutator.calls, wantCalls) {
		t.Fatalf("calls = %#v, want %#v", mutator.calls, wantCalls)
	}
	if !result.Updated || result.Release.Version != "1.1.0" || store.state.Operation != nil {
		t.Fatalf("result = %#v, state = %#v", result, store.state)
	}
	if store.state.LastKnownGood == nil || store.state.LastKnownGood.Version != "1.1.0" {
		t.Fatalf("last known good = %#v", store.state.LastKnownGood)
	}
	wantPhases := []OperationPhase{PhasePrepared, PhasePlugins, PhaseTrust, PhaseVerify, ""}
	gotPhases := make([]OperationPhase, 0, len(store.history))
	for _, state := range store.history {
		if state.Operation == nil {
			gotPhases = append(gotPhases, "")
			continue
		}
		gotPhases = append(gotPhases, state.Operation.Phase)
	}
	if !reflect.DeepEqual(gotPhases, wantPhases) {
		t.Fatalf("phases = %#v, want %#v", gotPhases, wantPhases)
	}
}

func Test_AutoReleaseUpdater_rollsBackToLastKnownGood_whenAnyMutationStageFails(t *testing.T) {
	stages := []autoReleaseStage{
		autoStageSnapshot,
		autoStageMarketplacePinned,
		autoStagePluginsUpdated,
		autoStageTrustUpdated,
		autoStageVerifiedFinal,
	}
	for _, stage := range stages {
		t.Run(string(stage), func(t *testing.T) {
			// Given
			previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
			store := &memoryLifecycleStore{state: LifecycleState{
				SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}, LastKnownGood: &previous,
			}}
			mutator := &fakeReleaseMutator{version: previous.Version, failStage: stage}
			updater := NewAutoReleaseUpdater(AutoReleaseConfig{
				LockPath: t.TempDir() + "/lifecycle.lock", LockStaleAfter: time.Minute,
			}, store, fixedClock{now: time.Now().UTC()}, &fakeVerifiedReleaseSource{
				found: true, candidate: releaseCandidate(),
			}, mutator)

			// When
			_, err := updater.Run(context.Background())

			// Then
			if !errors.Is(err, errInjectedReleaseStage) {
				t.Fatalf("Run() error = %v", err)
			}
			if mutator.version != previous.Version || store.state.Operation != nil {
				t.Fatalf("version = %q, state = %#v", mutator.version, store.state)
			}
			if store.state.LastKnownGood == nil || *store.state.LastKnownGood != previous {
				t.Fatalf("last known good = %#v", store.state.LastKnownGood)
			}
		})
	}
}

func releaseCandidate() AutoReleaseCandidate {
	commit := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	version := "1.1.0"
	return AutoReleaseCandidate{
		Release: VerifiedRelease{Package: "@nunch-dev/skills", Version: version, Commit: commit},
		Plugins: []AutoReleasePlugin{
			{
				ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager",
				FromVersion: "1.0.0", Version: version,
			},
			{
				ID: "git-tools@nunch-skills", Name: "git-tools",
				FromVersion: "0.2.1", Version: version,
			},
		},
	}
}
