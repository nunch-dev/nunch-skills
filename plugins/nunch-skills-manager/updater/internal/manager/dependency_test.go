package manager

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

func Test_CheckDependencies_reports_missing_tools_for_installed_plugins(t *testing.T) {
	// Given
	plugins := PluginList{Installed: []Plugin{
		{Name: "deep-interview", Installed: true},
		{Name: "git-tools", Installed: true},
	}}
	runner := &fakeRunner{responses: []commandResponse{
		{err: errors.New("python3 not found")},
		{err: errors.New("python not found")},
		{err: errors.New("uv not found")},
		{output: []byte("git version 2.51.0")},
	}}

	// When
	issues := CheckDependencies(context.Background(), plugins, runner)

	// Then
	want := []DependencyIssue{
		{Name: "python3", Requirement: "Python 3.11+", RequiredBy: []string{"deep-interview"}},
		{Name: "uv", Requirement: "uv", RequiredBy: []string{"deep-interview"}},
	}
	if !reflect.DeepEqual(issues, want) {
		t.Fatalf("CheckDependencies() = %#v, want %#v", issues, want)
	}
}

func Test_CheckDependencies_reports_python_when_version_is_too_old(t *testing.T) {
	// Given
	plugins := PluginList{Installed: []Plugin{{Name: "humanize-korean", Installed: true}}}
	runner := &fakeRunner{responses: []commandResponse{
		{output: []byte("Python 3.10.14")},
		{output: []byte("Python 3.10.14")},
	}}

	// When
	issues := CheckDependencies(context.Background(), plugins, runner)

	// Then
	want := []DependencyIssue{{
		Name: "python3", Requirement: "Python 3.11+", RequiredBy: []string{"humanize-korean"},
	}}
	if !reflect.DeepEqual(issues, want) {
		t.Fatalf("CheckDependencies() = %#v, want %#v", issues, want)
	}
}

func Test_CheckDependencies_deduplicates_shared_tools(t *testing.T) {
	// Given
	plugins := PluginList{Installed: []Plugin{
		{Name: "humanize-korean", Installed: true},
		{Name: "deep-interview", Installed: true},
	}}
	runner := &fakeRunner{responses: []commandResponse{
		{err: errors.New("python3 not found")},
		{err: errors.New("python not found")},
		{output: []byte("uv 0.8.13")},
	}}

	// When
	issues := CheckDependencies(context.Background(), plugins, runner)

	// Then
	want := []DependencyIssue{{
		Name:        "python3",
		Requirement: "Python 3.11+",
		RequiredBy:  []string{"deep-interview", "humanize-korean"},
	}}
	if !reflect.DeepEqual(issues, want) {
		t.Fatalf("CheckDependencies() = %#v, want %#v", issues, want)
	}
}

func Test_CheckDependencies_accepts_python_command_when_python3_is_unavailable(t *testing.T) {
	// Given
	plugins := PluginList{Installed: []Plugin{{Name: "humanize-korean", Installed: true}}}
	runner := &fakeRunner{responses: []commandResponse{
		{err: errors.New("python3 not found")},
		{output: []byte("Python 3.12.10")},
	}}

	// When
	issues := CheckDependencies(context.Background(), plugins, runner)

	// Then
	if len(issues) != 0 {
		t.Fatalf("CheckDependencies() = %#v, want no issues", issues)
	}
}

func Test_DiagnoseDependencies_reports_manual_kaneo_connection(t *testing.T) {
	// Given
	runner := &fakeRunner{responses: []commandResponse{{output: []byte(`{"installed":[{` +
		`"pluginId":"kaneo-skills@nunch-skills","name":"kaneo-skills",` +
		`"version":"0.1.0","installed":true}]}`)}}}
	config := Config{CodexCommand: "codex", Marketplace: "nunch-skills"}

	// When
	report, err := DiagnoseDependencies(context.Background(), config, runner)
	// Then
	if err != nil {
		t.Fatalf("DiagnoseDependencies() error = %v", err)
	}
	want := []ManualDependency{{Name: "Kaneo MCP", RequiredBy: []string{"kaneo-skills"}}}
	if !reflect.DeepEqual(report.Manual, want) {
		t.Fatalf("DiagnoseDependencies() manual = %#v, want %#v", report.Manual, want)
	}
}

func Test_supportsPython311_accepts_newer_minor_versions(t *testing.T) {
	// Given
	version := []byte("Python 3.14.4\n")

	// When
	supported := supportsPython311(version)

	// Then
	if !supported {
		t.Fatal("supportsPython311() = false, want true")
	}
}
