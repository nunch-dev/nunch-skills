package manager

import (
	"testing"
	"time"
)

func Test_ParsePluginList_returns_installed_plugins_when_codex_json_is_valid(t *testing.T) {
	// Given
	raw := []byte(`{"installed":[{` +
		`"pluginId":"deep-interview@nunch-skills",` +
		`"name":"deep-interview",` +
		`"marketplaceName":"nunch-skills",` +
		`"version":"0.2.0",` +
		`"installed":true,` +
		`"enabled":true}],` +
		`"available":[]}`)

	// When
	plugins, err := ParsePluginList(raw)
	// Then
	if err != nil {
		t.Fatalf("ParsePluginList() error = %v", err)
	}
	if len(plugins.Installed) != 1 || plugins.Installed[0].Version != "0.2.0" {
		t.Fatalf("ParsePluginList() = %#v", plugins)
	}
}

func Test_PlanRefreshes_returns_installed_plugins_with_manager_last(t *testing.T) {
	// Given
	plugins := PluginList{Installed: []Plugin{
		{ID: "deep-interview@nunch-skills", Name: "deep-interview", Version: "0.1.0", Installed: true},
		{ID: "nunch-skills-manager@nunch-skills", Name: "nunch-skills-manager", Version: "0.1.0", Installed: true},
		{ID: "kaneo-skills@nunch-skills", Name: "kaneo-skills", Version: "0.1.0", Installed: true},
	}}

	// When
	refreshes := PlanRefreshes(plugins, "nunch-skills-manager")

	// Then
	want := []string{"deep-interview", "kaneo-skills", "nunch-skills-manager"}
	if len(refreshes) != len(want) {
		t.Fatalf("PlanRefreshes() = %#v, want %#v", refreshes, want)
	}
	for index, name := range want {
		if refreshes[index].Name != name {
			t.Fatalf("PlanRefreshes()[%d] = %#v, want %q", index, refreshes[index], name)
		}
	}
}

func Test_ParseInstallResult_returns_new_version_when_codex_add_succeeds(t *testing.T) {
	// Given
	raw := []byte(`{"pluginId":"deep-interview@nunch-skills","name":"deep-interview","version":"0.2.0"}`)

	// When
	result, err := ParseInstallResult(raw)
	// Then
	if err != nil {
		t.Fatalf("ParseInstallResult() error = %v", err)
	}
	if result.PluginID != "deep-interview@nunch-skills" || result.Version != "0.2.0" {
		t.Fatalf("ParseInstallResult() = %#v", result)
	}
}

func Test_ShouldCheck_throttles_recent_success_when_interval_has_not_elapsed(t *testing.T) {
	// Given
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	state := State{LastCheckedAt: now.Add(-time.Hour), LastStatus: StatusSuccess}

	// When
	shouldCheck := ShouldCheck(state, now, 24*time.Hour, 30*time.Minute)

	// Then
	if shouldCheck {
		t.Fatal("ShouldCheck() = true, want false")
	}
}

func Test_ShouldCheck_retries_failure_when_retry_interval_has_elapsed(t *testing.T) {
	// Given
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	state := State{LastAttemptedAt: now.Add(-31 * time.Minute), LastStatus: StatusFailed}

	// When
	shouldCheck := ShouldCheck(state, now, 24*time.Hour, 30*time.Minute)

	// Then
	if !shouldCheck {
		t.Fatal("ShouldCheck() = false, want true")
	}
}
