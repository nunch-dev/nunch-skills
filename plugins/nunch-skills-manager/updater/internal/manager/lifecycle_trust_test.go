package manager

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func Test_VerifyManagerHook_returns_Codex_canonical_trust_hash(t *testing.T) {
	// Given
	pluginRoot := t.TempDir()
	hookPath := filepath.Join(pluginRoot, "hooks", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hookPath), 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	hook := []byte(`{"hooks":{"SessionStart":[{"matcher":"^startup$","hooks":[{` +
		`"type":"command",` +
		`"command":"\"${PLUGIN_ROOT}/scripts/run-manager.sh\" hook",` +
		`"commandWindows":"powershell -NoProfile -ExecutionPolicy Bypass -File ` +
		`\"${PLUGIN_ROOT}\\scripts\\run-manager.ps1\" hook",` +
		`"timeout":15,"statusMessage":"Checking nunch-skills updates"` +
		` }]}]}}`)
	if err := os.WriteFile(hookPath, hook, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	result, err := VerifyManagerHook(pluginRoot, SHA256Bytes(hook), "linux")
	// Then
	if err != nil {
		t.Fatalf("VerifyManagerHook() error = %v", err)
	}
	want := "sha256:a8e8f552ecd6f29d6c10a00470ea2ae396d3daa0471a3926f9ea68ccbaaa7b6d"
	if result.TrustHash != want || result.TrustID != ManagerHookTrustID {
		t.Fatalf("VerifyManagerHook() = %#v", result)
	}
}

func Test_CodexLifecycleBackend_doesNotMutateTrust_whenInstalledPayloadIsTampered(t *testing.T) {
	tests := []struct {
		name string
		path func(string) string
	}{
		{name: "plugin manifest", path: func(root string) string {
			return filepath.Join(root, ".codex-plugin", "plugin.json")
		}},
		{name: "launcher script", path: func(root string) string {
			return filepath.Join(root, "scripts", "run-manager.sh")
		}},
		{name: "selected binary", path: func(root string) string {
			return filepath.Join(root, "bin", installedManagerBinaryName(runtime.GOOS, runtime.GOARCH))
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			// Given
			root := t.TempDir()
			manifest := installedManagerReleaseFixture(t, root)
			configPath := filepath.Join(root, "config.toml")
			original := []byte("[unrelated]\nvalue = 1\n")
			if err := os.WriteFile(configPath, original, 0o600); err != nil {
				t.Fatalf("WriteFile(config) error = %v", err)
			}
			if err := os.WriteFile(test.path(root), []byte("tampered"), 0o600); err != nil {
				t.Fatalf("WriteFile(tamper) error = %v", err)
			}
			runner := &fakeRunner{responses: []commandResponse{{output: []byte(fmt.Sprintf(
				`{"installed":[{"pluginId":"nunch-skills-manager@nunch-skills",`+
					`"name":"nunch-skills-manager","marketplaceName":"nunch-skills",`+
					`"version":"1.1.0","installed":true,"source":{"path":%q}}]}`,
				root,
			))}}}
			backend := NewCodexLifecycleBackend(Config{
				CodexCommand: "codex", Marketplace: "nunch-skills", ManagerPlugin: defaultManagerPlugin,
			}, runner, configPath)

			// When
			ownership, hash, err := backend.TrustIntent(context.Background(), manifest)
			if err == nil {
				err = backend.Trust(context.Background(), manifest, ownership, hash)
			}

			// Then
			if err == nil {
				t.Fatal("Trust() error = nil")
			}
			after, readErr := os.ReadFile(configPath)
			if readErr != nil {
				t.Fatalf("ReadFile(config) error = %v", readErr)
			}
			if string(after) != string(original) {
				t.Fatalf("config changed after rejected payload: %q", after)
			}
		})
	}
}

func Test_CodexLifecycleBackend_RemoveTrust_succeeds_whenExactEntryIsAbsent(t *testing.T) {
	// Given
	root := t.TempDir()
	configPath := filepath.Join(root, "config.toml")
	expected := "sha256:" + strings.Repeat("a", 64)
	backend := NewCodexLifecycleBackend(Config{}, &fakeRunner{}, configPath)
	if err := os.WriteFile(configPath, []byte("[unrelated]\nvalue = 1\n"), 0o600); err != nil {
		t.Fatalf("WriteFile(absent) error = %v", err)
	}

	// When
	err := backend.RemoveTrust(context.Background(), expected)
	// Then
	if err != nil {
		t.Fatalf("RemoveTrust(absent) error = %v", err)
	}
}

func Test_CodexLifecycleBackend_RemoveTrust_preservesEntry_whenHashDiffers(t *testing.T) {
	// Given
	root := t.TempDir()
	configPath := filepath.Join(root, "config.toml")
	expected := "sha256:" + strings.Repeat("a", 64)
	other := "sha256:" + strings.Repeat("b", 64)
	conflict := []byte(fmt.Sprintf(
		"[hooks.state.%q]\ntrusted_hash = %q\n", ManagerHookTrustID, other,
	))
	if err := os.WriteFile(configPath, conflict, 0o600); err != nil {
		t.Fatalf("WriteFile(conflict) error = %v", err)
	}
	backend := NewCodexLifecycleBackend(Config{}, &fakeRunner{}, configPath)

	// When
	err := backend.RemoveTrust(context.Background(), expected)

	// Then
	if !errors.Is(err, ErrTrustConflict) {
		t.Fatalf("RemoveTrust(conflict) error = %v", err)
	}
	after, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("ReadFile(conflict) error = %v", err)
	}
	if string(after) != string(conflict) {
		t.Fatalf("conflicting trust changed: %q", after)
	}
}

func Test_VerifyManagerHook_rejects_digest_or_shape_drift(t *testing.T) {
	// Given
	pluginRoot := t.TempDir()
	hookPath := filepath.Join(pluginRoot, "hooks", "hooks.json")
	if err := os.MkdirAll(filepath.Dir(hookPath), 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	hook := []byte(`{"hooks":{"SessionStart":[]}}`)
	if err := os.WriteFile(hookPath, hook, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	_, digestErr := VerifyManagerHook(pluginRoot, SHA256Bytes([]byte("different")), "linux")
	_, shapeErr := VerifyManagerHook(pluginRoot, SHA256Bytes(hook), "linux")

	// Then
	if digestErr == nil || shapeErr == nil {
		t.Fatalf("VerifyManagerHook() digestErr = %v, shapeErr = %v", digestErr, shapeErr)
	}
}

func Test_VerifyManagerHook_rejectsCommandOrTimeoutOutsideExactAllowlist(t *testing.T) {
	base := `{"hooks":{"SessionStart":[{"matcher":"^startup$","hooks":[{` +
		`"type":"command","command":"\"${PLUGIN_ROOT}/scripts/run-manager.sh\" hook",` +
		`"commandWindows":"powershell -NoProfile -ExecutionPolicy Bypass -File ` +
		`\"${PLUGIN_ROOT}\\scripts\\run-manager.ps1\" hook","timeout":15,` +
		`"statusMessage":"Checking nunch-skills updates"}]}]}}`
	tests := map[string]string{
		"unix command":    strings.Replace(base, `run-manager.sh\" hook`, `other.sh\" hook`, 1),
		"windows command": strings.Replace(base, `run-manager.ps1\" hook`, `other.ps1\" hook`, 1),
		"timeout":         strings.Replace(base, `"timeout":15`, `"timeout":30`, 1),
	}
	for name, raw := range tests {
		t.Run(name, func(t *testing.T) {
			// Given
			pluginRoot := t.TempDir()
			hookPath := filepath.Join(pluginRoot, "hooks", "hooks.json")
			if err := os.MkdirAll(filepath.Dir(hookPath), 0o700); err != nil {
				t.Fatalf("MkdirAll() error = %v", err)
			}
			if err := os.WriteFile(hookPath, []byte(raw), 0o600); err != nil {
				t.Fatalf("WriteFile() error = %v", err)
			}

			// When
			_, err := VerifyManagerHook(pluginRoot, SHA256Bytes([]byte(raw)), "linux")

			// Then
			if err == nil {
				t.Fatal("VerifyManagerHook() error = nil")
			}
		})
	}
}

func installedManagerReleaseFixture(t *testing.T, root string) ReleaseManifest {
	t.Helper()
	manifest := validReleaseManifest(t)
	pluginManifest := []byte(`{"name":"nunch-skills-manager","version":"1.1.0"}`)
	manifest.Plugin = ReleaseFile{
		Path: managerPluginPath + "/.codex-plugin/plugin.json", SHA256: SHA256Bytes(pluginManifest),
	}
	writeManagerFixtureFile(t, root, ".codex-plugin/plugin.json", pluginManifest)
	hook := []byte(`{"hooks":{"SessionStart":[{"matcher":"^startup$","hooks":[{` +
		`"type":"command","command":"\"${PLUGIN_ROOT}/scripts/run-manager.sh\" hook",` +
		`"commandWindows":"powershell -NoProfile -ExecutionPolicy Bypass -File ` +
		`\"${PLUGIN_ROOT}\\scripts\\run-manager.ps1\" hook","timeout":15,` +
		`"statusMessage":"Checking nunch-skills updates"}]}]}}`)
	manifest.Hook = ReleaseFile{
		Path: "plugins/nunch-skills-manager/hooks/hooks.json", SHA256: SHA256Bytes(hook),
	}
	writeManagerFixtureFile(t, root, "hooks/hooks.json", hook)
	manifest.Scripts = []ReleaseFile{}
	for _, name := range []string{"run-manager.ps1", "run-manager.sh"} {
		data := []byte("fixture " + name)
		manifest.Scripts = append(manifest.Scripts, ReleaseFile{
			Path: "plugins/nunch-skills-manager/scripts/" + name, SHA256: SHA256Bytes(data),
		})
		writeManagerFixtureFile(t, root, "scripts/"+name, data)
	}
	for index := range manifest.Binaries {
		binary := &manifest.Binaries[index]
		name := installedManagerBinaryNameFromPlatform(binary.Platform)
		data := []byte("fixture " + binary.Platform)
		binary.GitPath = "plugins/nunch-skills-manager/bin/" + name
		binary.SHA256 = SHA256Bytes(data)
		writeManagerFixtureFile(t, root, "bin/"+name, data)
	}
	return manifest
}

func writeManagerFixtureFile(t *testing.T, root string, relative string, data []byte) {
	t.Helper()
	location := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(location), 0o700); err != nil {
		t.Fatalf("MkdirAll(%s) error = %v", relative, err)
	}
	if err := os.WriteFile(location, data, 0o600); err != nil {
		t.Fatalf("WriteFile(%s) error = %v", relative, err)
	}
}
