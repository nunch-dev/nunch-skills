package manager

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func Test_InspectDependencies_loadsInstalledPluginDeclarations(t *testing.T) {
	// Given
	deepInterview := dependencyPlugin(t, "deep-interview", `{
  "schemaVersion": 1,
  "executables": [
    {
      "name":"python3",
      "requirement":"Python 3.11+",
      "candidates":["python3","python"],
      "versionArgs":["--version"],
      "versionPrefix":"Python ",
      "minimumVersion":"3.11"
    },
    {"name":"uv","requirement":"uv","candidates":["uv"],"versionArgs":["--version"]}
  ]
}`)
	humanize := dependencyPlugin(t, "humanize-korean", `{
  "schemaVersion": 1,
  "executables": [
    {
      "name":"python3",
      "requirement":"Python 3.11+",
      "candidates":["python3","python"],
      "versionArgs":["--version"],
      "versionPrefix":"Python ",
      "minimumVersion":"3.11"
    }
  ]
}`)
	kaneo := dependencyPlugin(t, "kaneo-skills", `{
  "schemaVersion": 1,
  "manual": [{"name":"Kaneo MCP"}]
}`)
	plugins := PluginList{Installed: []Plugin{deepInterview, humanize, kaneo}}
	runner := &fakeRunner{responses: []commandResponse{
		{err: errors.New("python3 not found")},
		{err: errors.New("python not found")},
		{err: errors.New("uv not found")},
	}}

	// When
	report, err := InspectDependencies(context.Background(), plugins, runner)
	// Then
	if err != nil {
		t.Fatalf("InspectDependencies() error = %v", err)
	}
	want := DependencyReport{
		Missing: []DependencyIssue{
			{Name: "python3", Requirement: "Python 3.11+", RequiredBy: []string{"deep-interview", "humanize-korean"}},
			{Name: "uv", Requirement: "uv", RequiredBy: []string{"deep-interview"}},
		},
		Manual: []ManualDependency{{Name: "Kaneo MCP", RequiredBy: []string{"kaneo-skills"}}},
	}
	if !reflect.DeepEqual(report, want) {
		t.Fatalf("InspectDependencies() = %#v, want %#v", report, want)
	}
}

func Test_InspectDependencyInitialization_runsOnlyWhenInstalledSetChanges(t *testing.T) {
	// Given
	plugin := dependencyPlugin(t, "git-tools", `{
  "schemaVersion": 1,
  "executables": [
    {"name":"git","requirement":"Git","candidates":["git"],"versionArgs":["--version"]}
  ]
}`)
	pluginJSON := fmt.Sprintf(
		`{"installed":[{"pluginId":%q,"name":%q,"version":%q,"installed":true,"source":{"path":%q}}]}`,
		plugin.ID, plugin.Name, plugin.Version, plugin.Source.Path)
	store := &memoryStore{}
	config := Config{CodexCommand: "codex", Marketplace: "nunch-skills"}
	firstRunner := &fakeRunner{responses: []commandResponse{
		{output: []byte(pluginJSON)},
		{err: errors.New("git not found")},
	}}

	// When
	first, err := InspectDependencyInitialization(context.Background(), config, firstRunner, store)
	if err != nil {
		t.Fatalf("first InspectDependencyInitialization() error = %v", err)
	}
	secondRunner := &fakeRunner{responses: []commandResponse{{output: []byte(pluginJSON)}}}
	second, err := InspectDependencyInitialization(context.Background(), config, secondRunner, store)
	// Then
	if err != nil {
		t.Fatalf("second InspectDependencyInitialization() error = %v", err)
	}
	if !first.Changed || len(first.Report.Missing) != 1 {
		t.Fatalf("first inspection = %#v, want changed missing git", first)
	}
	if second.Changed || len(second.Report.Missing) != 0 || len(secondRunner.calls) != 1 {
		t.Fatalf("second inspection = %#v, calls = %#v", second, secondRunner.calls)
	}
	if store.state.DependencySignature == "" {
		t.Fatal("dependency signature was not persisted")
	}
}

func dependencyPlugin(t *testing.T, name string, manifest string) Plugin {
	t.Helper()
	root := filepath.Join(t.TempDir(), name)
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatalf("create plugin root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "dependencies.json"), []byte(manifest), 0o600); err != nil {
		t.Fatalf("write dependencies: %v", err)
	}
	return Plugin{
		ID:        name + "@nunch-skills",
		Name:      name,
		Version:   "0.1.0",
		Installed: true,
		Source:    PluginSource{Path: root},
	}
}
