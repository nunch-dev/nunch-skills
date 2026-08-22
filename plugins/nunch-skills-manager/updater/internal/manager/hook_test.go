package manager

import (
	"reflect"
	"testing"
	"time"
)

type launchCall struct {
	executable string
	args       []string
	env        []string
}

type fakeLauncher struct {
	calls []launchCall
}

func (launcher *fakeLauncher) Launch(executable string, args []string, env []string) error {
	launcher.calls = append(launcher.calls, launchCall{executable: executable, args: args, env: env})
	return nil
}

func Test_HookController_starts_background_check_when_interval_elapsed(t *testing.T) {
	// Given
	root := t.TempDir()
	config := RuntimeConfig{
		StatePath:       root + "/state.json",
		LockPath:        root + "/update.lock",
		SuccessInterval: 24 * time.Hour,
		RetryInterval:   30 * time.Minute,
		LockStaleAfter:  10 * time.Minute,
	}
	store := NewFileStore(config.StatePath)
	launcher := &fakeLauncher{}
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	controller := NewHookController(config, store, fixedClock{now: now}, launcher)

	// When
	result, err := controller.Run("/plugin/bin/manager", []string{"PATH=/bin"})
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if !result.Started || len(launcher.calls) != 1 {
		t.Fatalf("result = %#v, calls = %#v", result, launcher.calls)
	}
	if !reflect.DeepEqual(launcher.calls[0].args, []string{"run"}) {
		t.Fatalf("args = %#v", launcher.calls[0].args)
	}
}

func Test_HookController_returns_and_clears_completed_update_notice(t *testing.T) {
	// Given
	root := t.TempDir()
	config := RuntimeConfig{
		StatePath:       root + "/state.json",
		LockPath:        root + "/update.lock",
		SuccessInterval: 24 * time.Hour,
		RetryInterval:   30 * time.Minute,
		LockStaleAfter:  10 * time.Minute,
	}
	store := NewFileStore(config.StatePath)
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	if err := store.Save(State{
		LastCheckedAt: now,
		LastStatus:    StatusSuccess,
		PendingNotice: &PendingNotice{Updates: []Update{{
			PluginID:    "deep-interview@nunch-skills",
			FromVersion: "0.1.0",
			ToVersion:   "0.2.0",
		}}},
	}); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	controller := NewHookController(config, store, fixedClock{now: now}, &fakeLauncher{})

	// When
	result, err := controller.Run("/plugin/bin/manager", nil)
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Notice == "" || result.Started {
		t.Fatalf("result = %#v", result)
	}
	state, err := store.Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if state.PendingNotice != nil {
		t.Fatalf("pending notice was not cleared: %#v", state.PendingNotice)
	}
}
