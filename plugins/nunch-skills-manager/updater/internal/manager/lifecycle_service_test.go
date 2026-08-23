package manager

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"
)

type lifecycleBackendFake struct {
	marketplace           bool
	plugins               PluginList
	calls                 []string
	failAt                string
	failPinBeforeMutation bool
}

func (backend *lifecycleBackendFake) Marketplace(context.Context) (bool, error) {
	return backend.marketplace, nil
}

func (backend *lifecycleBackendFake) PinMarketplace(_ context.Context, commit string) error {
	backend.calls = append(backend.calls, "pin:"+commit)
	if backend.failPinBeforeMutation {
		return errors.New("pin failed before mutation")
	}
	backend.marketplace = true
	return backend.failure("pin")
}

func (backend *lifecycleBackendFake) Plugins(context.Context) (PluginList, error) {
	return backend.plugins, nil
}

func (backend *lifecycleBackendFake) Install(_ context.Context, name string) error {
	backend.calls = append(backend.calls, "install:"+name)
	for index := range backend.plugins.Installed {
		if backend.plugins.Installed[index].Name == name {
			backend.plugins.Installed[index].Installed = true
		}
	}
	return backend.failure("install:" + name)
}

func (backend *lifecycleBackendFake) Trust(
	context.Context,
	ReleaseManifest,
	Ownership,
	string,
) error {
	backend.calls = append(backend.calls, "trust")
	return backend.failure("trust")
}

func (backend *lifecycleBackendFake) TrustIntent(context.Context, ReleaseManifest) (Ownership, string, error) {
	hash := "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	return OwnershipCreated, hash, nil
}

func (backend *lifecycleBackendFake) RemovePlugin(_ context.Context, id string) error {
	backend.calls = append(backend.calls, "remove:"+id)
	for index := range backend.plugins.Installed {
		if backend.plugins.Installed[index].ID == id {
			backend.plugins.Installed[index].Installed = false
		}
	}
	return backend.failure("remove:" + id)
}

func (backend *lifecycleBackendFake) RemoveTrust(context.Context, string) error {
	backend.calls = append(backend.calls, "remove-trust")
	return backend.failure("remove-trust")
}

func (backend *lifecycleBackendFake) RemoveMarketplace(context.Context) error {
	if !backend.marketplace {
		return nil
	}
	backend.calls = append(backend.calls, "remove-marketplace")
	backend.marketplace = false
	return backend.failure("remove-marketplace")
}

func (backend *lifecycleBackendFake) failure(point string) error {
	if backend.failAt == point {
		return errors.New("injected failure")
	}
	return nil
}

func Test_LifecycleService_Install_defaults_to_manager_and_records_only_created_resources(t *testing.T) {
	// Given
	root := t.TempDir()
	backend := &lifecycleBackendFake{plugins: PluginList{Installed: []Plugin{
		{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "1.0.0"},
		{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0", Installed: true},
	}}}
	service := newLifecycleTestService(root, backend)

	// When
	result, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleInstall, Yes: true})
	// Then
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if len(result.Targets) != 1 || result.Targets[0] != "nunch-skills-manager" {
		t.Fatalf("Execute() targets = %#v", result.Targets)
	}
	state, err := NewLifecycleStore(filepath.Join(root, "lifecycle.json")).Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if resourceOwnership(state, ResourcePlugin, "nunch-skills-manager@nunch-skills") != OwnershipCreated {
		t.Fatalf("manager ownership = %#v", state.Resources)
	}
	if resourceOwnership(state, ResourcePlugin, "git-tools@nunch-skills") != "" {
		t.Fatalf("unselected plugin was recorded = %#v", state.Resources)
	}
}

func Test_LifecycleService_Install_all_usesVerifiedCatalog_beforeMarketplaceExists(t *testing.T) {
	// Given
	root := t.TempDir()
	backend := &lifecycleBackendFake{}
	service := newLifecycleTestService(root, backend)

	// When
	result, err := service.Execute(context.Background(), LifecycleCommand{
		Kind: LifecycleInstall, All: true, DryRun: true,
	})
	// Then
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	want := []string{"nunch-skills-manager", "git-tools"}
	if len(result.Targets) != len(want) || result.Targets[0] != want[0] || result.Targets[1] != want[1] {
		t.Fatalf("Execute() targets = %#v, want %#v", result.Targets, want)
	}
}

func Test_LifecycleService_DryRun_has_zero_backend_or_state_mutation(t *testing.T) {
	// Given
	root := t.TempDir()
	backend := &lifecycleBackendFake{marketplace: true, plugins: PluginList{Installed: []Plugin{
		{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "1.0.0"},
		{ID: "git-tools@nunch-skills", Name: "git-tools", Version: "1.0.0"},
	}}}
	service := newLifecycleTestService(root, backend)

	// When
	result, err := service.Execute(context.Background(), LifecycleCommand{
		Kind: LifecycleInstall, Plugins: []string{"git-tools"}, DryRun: true,
	})
	// Then
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
	if len(result.Targets) != 2 || len(backend.calls) != 0 {
		t.Fatalf("Execute() result = %#v, calls = %#v", result, backend.calls)
	}
	state, err := NewLifecycleStore(filepath.Join(root, "lifecycle.json")).Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if len(state.Resources) != 0 || state.Operation != nil {
		t.Fatalf("dry-run state = %#v", state)
	}
}

func Test_LifecycleService_Uninstall_requires_confirmation_and_removes_manager_last(t *testing.T) {
	// Given
	root := t.TempDir()
	store := NewLifecycleStore(filepath.Join(root, "lifecycle.json"))
	state := LifecycleState{SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{
		{Kind: ResourcePlugin, Name: "nunch-skills-manager@nunch-skills", Ownership: OwnershipCreated},
		{Kind: ResourcePlugin, Name: "git-tools@nunch-skills", Ownership: OwnershipCreated},
	}}
	if err := store.Save(state); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	backend := &lifecycleBackendFake{}
	service := newLifecycleTestService(root, backend)

	// When
	_, err := service.Execute(context.Background(), LifecycleCommand{Kind: LifecycleUninstall})

	// Then
	if !errors.Is(err, ErrConfirmationRequired) {
		t.Fatalf("Execute() error = %v, want ErrConfirmationRequired", err)
	}
	if len(backend.calls) != 0 {
		t.Fatalf("calls before confirmation = %#v", backend.calls)
	}
	confirmed := LifecycleCommand{Kind: LifecycleUninstall, Yes: true}
	if _, err := service.Execute(context.Background(), confirmed); err != nil {
		t.Fatalf("confirmed Execute() error = %v", err)
	}
	want := []string{"remove:git-tools@nunch-skills", "remove:nunch-skills-manager@nunch-skills"}
	if len(backend.calls) != len(want) || backend.calls[0] != want[0] || backend.calls[1] != want[1] {
		t.Fatalf("confirmed calls = %#v", backend.calls)
	}
}

func newLifecycleTestService(root string, backend LifecycleBackend) *LifecycleService {
	manifest := ReleaseManifest{
		NPM: ReleaseNPM{Version: "1.0.0"},
		Git: ReleaseGit{Commit: "0123456789012345678901234567890123456789"},
		Plugins: []ReleasePlugin{
			{Name: "git-tools", Version: "0.2.1"},
			{Name: "nunch-skills-manager", Version: "1.0.0"},
		},
	}
	return NewLifecycleService(LifecycleServiceConfig{
		Backend: backend, Store: NewLifecycleStore(filepath.Join(root, "lifecycle.json")),
		LockPath: filepath.Join(root, "lifecycle.lock"), LockStaleAfter: time.Minute,
		Clock: SystemClock{}, Manifest: manifest, ManagerName: "nunch-skills-manager", Marketplace: "nunch-skills",
	})
}

func resourceOwnership(state LifecycleState, kind ResourceKind, name string) Ownership {
	for _, resource := range state.Resources {
		if resource.Kind == kind && resource.Name == name {
			return resource.Ownership
		}
	}
	return ""
}
