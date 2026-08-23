package manager

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func Test_LifecycleService_Install_recovers_crash_from_every_mutating_phase(t *testing.T) {
	phases := []OperationPhase{PhasePrepared, PhasePlugins, PhaseTrust, PhaseVerify, PhaseRollback}
	for _, phase := range phases {
		t.Run(string(phase), func(t *testing.T) {
			root := t.TempDir()
			store := NewLifecycleStore(filepath.Join(root, "lifecycle.json"))
			created := []OwnedResource{
				{Kind: ResourceMarketplace, Name: "nunch-skills", Ownership: OwnershipCreated},
				{Kind: ResourcePlugin, Name: "nunch-skills-manager@nunch-skills", Ownership: OwnershipCreated},
			}
			state := LifecycleState{
				SchemaVersion: LifecycleSchemaVersion,
				Resources: []OwnedResource{
					created[0],
					created[1],
					{Kind: ResourcePlugin, Name: "deep-interview@nunch-skills", Ownership: OwnershipCreated},
				},
				Operation: &LifecycleOperation{
					ID: "crashed-install", Kind: OperationInstall, Phase: phase,
					StartedAt:        time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
					CreatedResources: created,
				},
			}
			if err := store.Save(state); err != nil {
				t.Fatalf("Save() error = %v", err)
			}
			backend := &lifecycleBackendFake{marketplace: true, plugins: PluginList{Installed: []Plugin{
				{
					ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager",
					Version: "1.0.0", Installed: true,
				},
				{
					ID: "deep-interview@nunch-skills", Name: "deep-interview",
					Version: "1.0.0", Installed: true,
				},
			}}}
			service := newLifecycleTestService(root, backend)

			_, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
			if err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
			finalState, loadErr := store.Load()
			if loadErr != nil {
				t.Fatalf("Load() error = %v", loadErr)
			}
			if finalState.Operation != nil {
				t.Fatalf("final operation = %#v", finalState.Operation)
			}
			if resourceOwnership(
				finalState,
				ResourcePlugin,
				"deep-interview@nunch-skills",
			) != OwnershipCreated {
				t.Fatalf("stable created plugin was removed: %#v", finalState.Resources)
			}
		})
	}
}

func Test_LifecycleService_Install_recovers_persisted_rollback_before_new_transaction(t *testing.T) {
	root := t.TempDir()
	store := NewLifecycleStore(filepath.Join(root, "lifecycle.json"))
	created := []OwnedResource{
		{Kind: ResourceMarketplace, Name: "nunch-skills", Ownership: OwnershipCreated},
		{Kind: ResourcePlugin, Name: "nunch-skills-manager@nunch-skills", Ownership: OwnershipCreated},
	}
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources: []OwnedResource{
			created[0],
			created[1],
			{
				Kind: ResourcePlugin, Name: "git-tools@nunch-skills",
				Ownership: OwnershipPreExisting, PreStateFingerprint: "1.0.0",
			},
		},
		Operation: &LifecycleOperation{
			ID: "interrupted-install", Kind: OperationInstall, Phase: PhaseRollback,
			StartedAt:        time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
			CreatedResources: created,
		},
	}
	if err := store.Save(state); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	backend := &lifecycleBackendFake{marketplace: true, plugins: PluginList{Installed: []Plugin{
		{
			ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager",
			Version: "1.0.0", Installed: true,
		},
		{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0", Installed: true},
	}}}
	service := newLifecycleTestService(root, backend)

	_, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	finalState, loadErr := store.Load()
	if loadErr != nil {
		t.Fatalf("Load() error = %v", loadErr)
	}
	if finalState.Operation != nil {
		t.Fatalf("final operation = %#v", finalState.Operation)
	}
	if resourceOwnership(finalState, ResourcePlugin, "git-tools@nunch-skills") != OwnershipPreExisting {
		t.Fatalf("pre-existing plugin changed: %#v", finalState.Resources)
	}
	wantPrefix := []string{"remove:nunch-skills-manager@nunch-skills", "remove-marketplace"}
	for index, want := range wantPrefix {
		if backend.calls[index] != want {
			t.Fatalf("recovery calls = %#v", backend.calls)
		}
	}
}

func Test_LifecycleService_Install_recoversTrustIntent_whenConfigEntryWasNeverWritten(t *testing.T) {
	// Given
	root := t.TempDir()
	store := NewLifecycleStore(filepath.Join(root, "lifecycle.json"))
	hash := "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	trust := OwnedResource{
		Kind: ResourceTrust, Name: ManagerHookTrustID,
		Ownership: OwnershipCreated, PreStateFingerprint: hash,
	}
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{trust},
		Operation: &LifecycleOperation{
			ID: "trust-intent-only", Kind: OperationInstall, Phase: PhaseTrust,
			StartedAt:        time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
			CreatedResources: []OwnedResource{trust},
		},
	}
	if err := store.Save(state); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	backend := &lifecycleBackendFake{}
	service := newLifecycleTestService(root, backend)

	// When
	_, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
	// Then
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	finalState, err := store.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if finalState.Operation != nil {
		t.Fatalf("final operation = %#v", finalState.Operation)
	}
	if len(backend.calls) == 0 || backend.calls[0] != "remove-trust" {
		t.Fatalf("recovery and retry calls = %#v", backend.calls)
	}
}
