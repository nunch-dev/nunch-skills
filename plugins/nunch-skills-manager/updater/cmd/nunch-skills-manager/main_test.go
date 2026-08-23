package main

import (
	"bytes"
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager"
)

func Test_runWith_returns_help_and_version_without_runtime_configuration(t *testing.T) {
	// Given
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	// When
	helpExit := runWith([]string{"nunch-skills", "--help"}, &stdout, &stderr)
	versionExit := runWith([]string{"nunch-skills", "--version"}, &stdout, &stderr)

	// Then
	if helpExit != 0 || versionExit != 0 || stderr.Len() != 0 {
		t.Fatalf("runWith() help = %d, version = %d, stderr = %q", helpExit, versionExit, stderr.String())
	}
}

func Test_runWith_returns_usage_exit_for_unknown_command(t *testing.T) {
	// Given
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	// When
	exitCode := runWith([]string{"nunch-skills", "repair"}, &stdout, &stderr)

	// Then
	if exitCode != 2 || stderr.Len() == 0 {
		t.Fatalf("runWith() exit = %d, stderr = %q", exitCode, stderr.String())
	}
}

func Test_confirmedAnswer_accepts_only_explicit_affirmation(t *testing.T) {
	// Given
	tests := map[string]bool{"y": true, "YES": true, " n ": false, "": false}

	for answer, want := range tests {
		// When
		got := confirmedAnswer(answer)

		// Then
		if got != want {
			t.Fatalf("confirmedAnswer(%q) = %t, want %t", answer, got, want)
		}
	}
}

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
