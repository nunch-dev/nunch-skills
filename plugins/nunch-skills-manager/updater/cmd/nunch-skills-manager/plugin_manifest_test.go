package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func Test_PluginPackage_exposesDefaultSessionStartHook(t *testing.T) {
	// Given
	_, sourcePath, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller() did not return the test source path")
	}
	pluginRoot := filepath.Clean(filepath.Join(filepath.Dir(sourcePath), "..", "..", ".."))
	hookPath := filepath.Join(pluginRoot, "hooks", "hooks.json")
	data, err := os.ReadFile(hookPath)
	if err != nil {
		t.Fatalf("read default plugin hooks: %v", err)
	}
	var config struct {
		Hooks struct {
			SessionStart []json.RawMessage `json:"SessionStart"`
		} `json:"hooks"`
	}
	if err := json.Unmarshal(data, &config); err != nil {
		t.Fatalf("decode default plugin hooks: %v", err)
	}

	// When
	registered := len(config.Hooks.SessionStart) > 0

	// Then
	if !registered {
		t.Fatal("default plugin hooks do not register SessionStart")
	}
}
