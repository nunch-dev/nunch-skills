package manager

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"testing"
)

const pythonDependency = `{
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
}`

func Test_InspectDependencies_reports_version_belowMinimum(t *testing.T) {
	// Given
	plugin := dependencyPlugin(t, "humanize-korean", pythonDependency)
	runner := &fakeRunner{responses: []commandResponse{
		{output: []byte("Python 3.10.14")},
		{output: []byte("Python 3.10.14")},
	}}

	// When
	report, err := InspectDependencies(context.Background(), PluginList{Installed: []Plugin{plugin}}, runner)
	// Then
	if err != nil {
		t.Fatalf("InspectDependencies() error = %v", err)
	}
	want := []DependencyIssue{{Name: "python3", Requirement: "Python 3.11+", RequiredBy: []string{"humanize-korean"}}}
	if !reflect.DeepEqual(report.Missing, want) {
		t.Fatalf("missing = %#v, want %#v", report.Missing, want)
	}
}

func Test_InspectDependencies_acceptsFallbackExecutable(t *testing.T) {
	// Given
	plugin := dependencyPlugin(t, "humanize-korean", pythonDependency)
	runner := &fakeRunner{responses: []commandResponse{
		{err: errors.New("python3 not found")},
		{output: []byte("Python 3.12.10")},
	}}

	// When
	report, err := InspectDependencies(context.Background(), PluginList{Installed: []Plugin{plugin}}, runner)
	// Then
	if err != nil {
		t.Fatalf("InspectDependencies() error = %v", err)
	}
	if len(report.Missing) != 0 {
		t.Fatalf("missing = %#v, want none", report.Missing)
	}
}

func Test_DiagnoseDependencies_reportsManualDeclaration(t *testing.T) {
	// Given
	plugin := dependencyPlugin(t, "kaneo-skills", `{"schemaVersion":1,"manual":[{"name":"Kaneo MCP"}]}`)
	pluginJSON := fmt.Sprintf(
		`{"installed":[{"pluginId":%q,"name":%q,"version":%q,"installed":true,"source":{"path":%q}}]}`,
		plugin.ID, plugin.Name, plugin.Version, plugin.Source.Path)
	runner := &fakeRunner{responses: []commandResponse{{output: []byte(pluginJSON)}}}
	config := Config{CodexCommand: "codex", Marketplace: "nunch-skills"}

	// When
	report, err := DiagnoseDependencies(context.Background(), config, runner)
	// Then
	if err != nil {
		t.Fatalf("DiagnoseDependencies() error = %v", err)
	}
	want := []ManualDependency{{Name: "Kaneo MCP", RequiredBy: []string{"kaneo-skills"}}}
	if !reflect.DeepEqual(report.Manual, want) {
		t.Fatalf("manual = %#v, want %#v", report.Manual, want)
	}
}

func Test_InspectDependencies_rejectsUnknownManifestField(t *testing.T) {
	// Given
	plugin := dependencyPlugin(t, "invalid", `{"schemaVersion":1,"unexpected":true}`)

	// When
	_, err := InspectDependencies(context.Background(), PluginList{Installed: []Plugin{plugin}}, &fakeRunner{})

	// Then
	var manifestError *DependencyManifestError
	if !errors.As(err, &manifestError) {
		t.Fatalf("InspectDependencies() error = %v, want DependencyManifestError", err)
	}
}

func Test_VersionMeetsMinimum_acceptsNewerMinor(t *testing.T) {
	// Given
	minimum, err := parseToolVersion("3.11")
	if err != nil {
		t.Fatalf("parseToolVersion() error = %v", err)
	}

	// When
	supported := versionMeetsMinimum([]byte("Python 3.14.4\n"), "Python ", minimum)

	// Then
	if !supported {
		t.Fatal("versionMeetsMinimum() = false, want true")
	}
}
