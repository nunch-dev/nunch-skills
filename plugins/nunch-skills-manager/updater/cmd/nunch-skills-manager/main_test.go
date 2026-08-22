package main

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager"
)

type failingDependencyRunner struct{}

func (failingDependencyRunner) Run(context.Context, string, ...string) ([]byte, error) {
	return nil, errors.New("malformed dependencies.json")
}

type recordingHookRunner struct {
	calls int
}

func (runner *recordingHookRunner) Run(string, []string) (manager.HookResult, error) {
	runner.calls++
	return manager.HookResult{}, nil
}

func Test_runHookWith_continuesUpdateWhenDependencyInspectionFails(t *testing.T) {
	// Given
	root := t.TempDir()
	config := manager.RuntimeConfig{
		Manager:         manager.Config{CodexCommand: "codex", Marketplace: "nunch-skills"},
		StatePath:       filepath.Join(root, "state.json"),
		CommandTimeout:  time.Second,
		SuccessInterval: time.Hour,
	}
	controller := &recordingHookRunner{}

	// When
	exitCode := runHookWith(
		config,
		"/plugin/bin/nunch-skills-manager",
		failingDependencyRunner{},
		manager.NewFileStore(config.StatePath),
		controller,
	)

	// Then
	if exitCode != 0 {
		t.Fatalf("runHookWith() exit code = %d, want 0", exitCode)
	}
	if controller.calls != 1 {
		t.Fatalf("hook controller calls = %d, want 1", controller.calls)
	}
}
