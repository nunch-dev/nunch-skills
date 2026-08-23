package manager

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func Test_LifecycleService_Install_dry_run_does_not_recover_persisted_rollback(t *testing.T) {
	// Given
	root := t.TempDir()
	statePath := filepath.Join(root, "lifecycle.json")
	store := NewLifecycleStore(statePath)
	state := LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources: []OwnedResource{
			{Kind: ResourceMarketplace, Name: "nunch-skills", Ownership: OwnershipCreated},
			{Kind: ResourcePlugin, Name: "nunch-skills-manager@nunch-skills", Ownership: OwnershipCreated},
		},
		Operation: &LifecycleOperation{
			ID: "interrupted-install", Kind: OperationInstall, Phase: PhaseRollback,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
	}
	if err := store.Save(state); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	before, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile() setup error = %v", err)
	}
	backend := &lifecycleBackendFake{marketplace: true, plugins: PluginList{Installed: []Plugin{
		{
			ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager",
			Version: "1.0.0", Installed: true,
		},
	}}}
	service := newLifecycleTestService(root, backend)

	// When
	_, executeErr := service.Execute(context.Background(), LifecycleCommand{
		Kind: LifecycleInstall, DryRun: true,
	})

	// Then
	if executeErr != nil {
		t.Fatalf("Execute() error = %v", executeErr)
	}
	after, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile() result error = %v", err)
	}
	if string(after) != string(before) {
		t.Fatalf("dry-run changed lifecycle state\nbefore: %s\nafter: %s", before, after)
	}
	if len(backend.calls) != 0 {
		t.Fatalf("dry-run backend mutations = %#v", backend.calls)
	}
}

func Test_LifecycleService_Install_rolls_back_created_resources_after_partial_failure(t *testing.T) {
	root := t.TempDir()
	backend := &lifecycleBackendFake{marketplace: true, failAt: "install:git-tools", plugins: PluginList{
		Installed: []Plugin{
			{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "1.0.0"},
			{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0"},
		},
	}}
	service := newLifecycleTestService(root, backend)

	_, err := service.Execute(context.Background(), LifecycleCommand{
		Kind: LifecycleInstall, Plugins: []string{"git-tools"}, Yes: true,
	})

	if err == nil {
		t.Fatal("Execute() error = nil")
	}
	state, loadErr := NewLifecycleStore(filepath.Join(root, "lifecycle.json")).Load()
	if loadErr != nil {
		t.Fatalf("Load() error = %v", loadErr)
	}
	if len(state.Resources) != 1 ||
		resourceOwnership(state, ResourceMarketplace, "nunch-skills") != OwnershipPreExisting {
		t.Fatalf("rollback resources = %#v, want preserved marketplace", state.Resources)
	}
	if state.Operation != nil {
		t.Fatalf("rollback operation = %#v, want nil", state.Operation)
	}
	wantCalls := []string{
		"pin:0123456789012345678901234567890123456789", "install:nunch-skills-manager",
		"install:git-tools", "remove:git-tools@nunch-skills", "remove:nunch-skills-manager@nunch-skills",
	}
	if len(backend.calls) != len(wantCalls) {
		t.Fatalf("rollback calls = %#v", backend.calls)
	}
	for index, want := range wantCalls {
		if backend.calls[index] != want {
			t.Fatalf("rollback calls = %#v", backend.calls)
		}
	}
}

func Test_LifecycleService_Install_rollback_preserves_preexisting_resources_and_allows_rerun(t *testing.T) {
	root := t.TempDir()
	store := NewLifecycleStore(filepath.Join(root, "lifecycle.json"))
	preexisting := LifecycleState{SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{
		{
			Kind: ResourceMarketplace, Name: "nunch-skills",
			Ownership: OwnershipPreExisting, PreStateFingerprint: "existing-marketplace",
		},
		{
			Kind: ResourcePlugin, Name: "git-tools@nunch-skills",
			Ownership: OwnershipPreExisting, PreStateFingerprint: "1.0.0",
		},
	}}
	if err := store.Save(preexisting); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	backend := &lifecycleBackendFake{marketplace: true, failAt: "trust", plugins: PluginList{
		Installed: []Plugin{
			{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "1.0.0"},
			{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0", Installed: true},
		},
	}}
	service := newLifecycleTestService(root, backend)

	_, firstErr := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
	backend.failAt = ""
	_, secondErr := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})

	if firstErr == nil || secondErr != nil {
		t.Fatalf("Execute() first error = %v, rerun error = %v", firstErr, secondErr)
	}
	state, err := store.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if resourceOwnership(state, ResourceMarketplace, "nunch-skills") != OwnershipPreExisting ||
		resourceOwnership(state, ResourcePlugin, "git-tools@nunch-skills") != OwnershipPreExisting {
		t.Fatalf("pre-existing resources changed: %#v", state.Resources)
	}
	if state.Operation != nil {
		t.Fatalf("rerun operation = %#v", state.Operation)
	}
}

func Test_LifecycleService_Install_rollback_removes_marketplace_created_by_failed_operation(t *testing.T) {
	root := t.TempDir()
	backend := &lifecycleBackendFake{failAt: "install:nunch-skills-manager"}
	service := newLifecycleTestService(root, backend)

	_, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})

	if err == nil {
		t.Fatal("Execute() error = nil")
	}
	if backend.marketplace {
		t.Fatal("created marketplace remained after rollback")
	}
	state, loadErr := NewLifecycleStore(filepath.Join(root, "lifecycle.json")).Load()
	if loadErr != nil {
		t.Fatalf("Load() error = %v", loadErr)
	}
	if len(state.Resources) != 0 || state.Operation != nil {
		t.Fatalf("rollback state = %#v", state)
	}
}

func Test_LifecycleService_Install_rollback_removes_manager_last_after_trust_failure(t *testing.T) {
	root := t.TempDir()
	backend := &lifecycleBackendFake{marketplace: true, failAt: "trust", plugins: PluginList{
		Installed: []Plugin{
			{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "1.0.0"},
			{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0"},
		},
	}}
	service := newLifecycleTestService(root, backend)

	_, err := service.Execute(context.Background(), LifecycleCommand{
		Kind: LifecycleInstall, Plugins: []string{"git-tools"}, Yes: true,
	})

	if err == nil {
		t.Fatal("Execute() error = nil")
	}
	wantSuffix := []string{"remove:git-tools@nunch-skills", "remove:nunch-skills-manager@nunch-skills"}
	gotSuffix := backend.calls[len(backend.calls)-len(wantSuffix):]
	for index, want := range wantSuffix {
		if gotSuffix[index] != want {
			t.Fatalf("rollback calls = %#v", backend.calls)
		}
	}
}

func Test_LifecycleService_Install_pin_failure_before_creation_allows_immediate_retry(t *testing.T) {
	root := t.TempDir()
	backend := &lifecycleBackendFake{failPinBeforeMutation: true}
	service := newLifecycleTestService(root, backend)

	_, firstErr := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
	backend.failPinBeforeMutation = false
	_, secondErr := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})

	if firstErr == nil || secondErr != nil {
		t.Fatalf("Execute() first error = %v, retry error = %v", firstErr, secondErr)
	}
	state, err := NewLifecycleStore(filepath.Join(root, "lifecycle.json")).Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if state.Operation != nil {
		t.Fatalf("retry operation = %#v", state.Operation)
	}
	for _, call := range backend.calls {
		if call == "remove-marketplace" {
			t.Fatalf("pin failure before mutation attempted marketplace removal: %#v", backend.calls)
		}
	}
}
