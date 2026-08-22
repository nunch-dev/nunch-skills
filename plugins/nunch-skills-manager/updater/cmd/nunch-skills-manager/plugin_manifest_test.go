package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"
)

func Test_PluginManifest_registersSessionStartHook(t *testing.T) {
	// Given
	_, sourcePath, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller() did not return the test source path")
	}
	pluginRoot := filepath.Clean(filepath.Join(filepath.Dir(sourcePath), "..", "..", ".."))
	manifestPath := filepath.Join(pluginRoot, ".codex-plugin", "plugin.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest struct {
		Hooks []string `json:"hooks"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}

	// When
	registered := slices.Contains(manifest.Hooks, "./hooks/session-start-auto-update.json")

	// Then
	if !registered {
		t.Fatalf("plugin hooks = %v, want SessionStart updater hook", manifest.Hooks)
	}
}
