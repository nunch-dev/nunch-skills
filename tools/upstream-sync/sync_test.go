package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func Test_Sync_copies_managed_paths_and_updates_versions(t *testing.T) {
	// Given
	ctx := context.Background()
	root := t.TempDir()
	remote := createRemote(t)
	writeFile(t, filepath.Join(root, "plugins/example/skills/stale.md"), "stale\n")
	writeFile(t, filepath.Join(root, "plugins/example/.codex-plugin/plugin.json"),
		`{"name":"example","version":"2.3.2"}`)
	configPath := filepath.Join(root, "upstreams.json")
	lockPath := filepath.Join(root, "upstreams.lock.json")
	writeFile(t, configPath, fmt.Sprintf(`{
  "upstreams": [{
    "name": "example",
    "repository": %q,
    "ref": "main",
		"copies": [{
		  "source": "content",
		  "destination": "plugins/example/skills",
		  "removeFrontmatter": ["disable-model-invocation"]
		}],
		"version": {
		  "source": "manifest/plugin.json",
		  "appendCommit": true,
		  "targets": ["plugins/example/.codex-plugin/plugin.json"]
		}
  }]
}`, remote))

	// When
	err := syncConfigured(ctx, root, configPath, lockPath)
	// Then
	if err != nil {
		t.Fatalf("syncConfigured() error = %v", err)
	}
	assertFile(t, filepath.Join(root, "plugins/example/skills/SKILL.md"),
		"---\nname: example\n---\nupstream\n")
	assertMissing(t, filepath.Join(root, "plugins/example/skills/stale.md"))
	commit := gitFixtureOutput(t, remote, "rev-parse", "HEAD")
	assertJSONVersion(t, filepath.Join(root, "plugins/example/.codex-plugin/plugin.json"),
		"2.4.0+upstream."+commit[:12])
	assertLockCommit(t, lockPath, "example", commit)
}

func Test_LoadConfig_rejects_destination_outside_root(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "upstreams.json")
	writeFile(t, path, `{
  "upstreams": [{
    "name": "escape",
    "repository": "https://example.com/repo.git",
    "ref": "main",
    "copies": [{"source": "content", "destination": "../outside"}]
  }]
}`)

	// When
	_, err := loadConfig(path)

	// Then
	if err == nil || !strings.Contains(err.Error(), "destination") {
		t.Fatalf("loadConfig() error = %v, want destination error", err)
	}
}

func Test_BuildVersion_replaces_existing_build_metadata(t *testing.T) {
	// Given
	version := "2.4.0+vendor.previous"
	commit := "0123456789abcdef"

	// When
	got := buildVersion(version, commit)

	// Then
	want := "2.4.0+upstream.0123456789ab"
	if got != want {
		t.Fatalf("buildVersion() = %q, want %q", got, want)
	}
}

func Test_Sync_preserves_workspace_when_any_clone_fails(t *testing.T) {
	// Given
	ctx := context.Background()
	root := t.TempDir()
	remote := createRemote(t)
	destination := filepath.Join(root, "plugins/example/skills/SKILL.md")
	writeFile(t, destination, "local\n")
	configPath := filepath.Join(root, "upstreams.json")
	writeFile(t, configPath, fmt.Sprintf(`{
  "upstreams": [
    {
      "name": "example",
      "repository": %q,
      "ref": "main",
      "copies": [{"source": "content", "destination": "plugins/example/skills"}]
    },
    {
      "name": "broken",
      "repository": %q,
      "ref": "missing-ref",
      "copies": [{"source": "content", "destination": "plugins/broken/skills"}]
    }
  ]
}`, remote, remote))

	// When
	err := syncConfigured(ctx, root, configPath, filepath.Join(root, "upstreams.lock.json"))

	// Then
	if err == nil {
		t.Fatal("syncConfigured() error = nil, want clone failure")
	}
	assertFile(t, destination, "local\n")
}

func createRemote(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	gitRun(t, dir, "init", "-b", "main")
	gitRun(t, dir, "config", "user.name", "Upstream Fixture")
	gitRun(t, dir, "config", "user.email", "fixture@example.com")
	writeFile(t, filepath.Join(dir, "content/SKILL.md"),
		"---\nname: example\ndisable-model-invocation: true\n---\nupstream\n")
	writeFile(t, filepath.Join(dir, "manifest/plugin.json"), `{"version":"2.4.0"}`)
	gitRun(t, dir, "add", ".")
	gitRun(t, dir, "commit", "-m", "fixture")
	return dir
}

func gitRun(t *testing.T, dir string, args ...string) {
	t.Helper()
	command := exec.Command("git", args...)
	command.Dir = dir
	if output, err := command.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, output)
	}
}

func gitFixtureOutput(t *testing.T, dir string, args ...string) string {
	t.Helper()
	command := exec.Command("git", append([]string{"-C", dir}, args...)...)
	output, err := command.Output()
	if err != nil {
		t.Fatalf("git %s: %v", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(output))
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func assertFile(t *testing.T, path, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if string(data) != want {
		t.Fatalf("%s = %q, want %q", path, data, want)
	}
}

func assertMissing(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("%s still exists", path)
	}
}

func assertJSONVersion(t *testing.T, path, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var manifest struct {
		Version string `json:"version"`
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("decode %s: %v", path, err)
	}
	if manifest.Version != want {
		t.Fatalf("version = %q, want %q", manifest.Version, want)
	}
}

func assertLockCommit(t *testing.T, path, name, want string) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	var lock struct {
		Upstreams map[string]string `json:"upstreams"`
	}
	if err := json.Unmarshal(data, &lock); err != nil {
		t.Fatalf("decode lock: %v", err)
	}
	if lock.Upstreams[name] != want {
		t.Fatalf("lock commit = %q, want %q", lock.Upstreams[name], want)
	}
}
