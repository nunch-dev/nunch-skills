package manager

import (
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

type ParseError struct {
	Reason string
}

func (err *ParseError) Error() string {
	return "invalid Codex plugin list: " + err.Reason
}

func ParsePluginList(raw []byte) (PluginList, error) {
	var plugins PluginList
	if err := json.Unmarshal(raw, &plugins); err != nil {
		return PluginList{}, fmt.Errorf("decode Codex plugin list: %w", err)
	}
	for _, plugin := range plugins.Installed {
		if plugin.ID == "" || plugin.Name == "" || plugin.Version == "" {
			return PluginList{}, &ParseError{Reason: "installed plugin is missing identity or version"}
		}
	}
	return plugins, nil
}

func ParseInstallResult(raw []byte) (InstallResult, error) {
	var result InstallResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return InstallResult{}, fmt.Errorf("decode Codex plugin install result: %w", err)
	}
	if result.PluginID == "" || result.Name == "" || result.Version == "" {
		return InstallResult{}, &ParseError{Reason: "plugin install result is missing identity or version"}
	}
	return result, nil
}

func PlanRefreshes(plugins PluginList, managerPlugin string) []Plugin {
	refreshes := make([]Plugin, 0, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		if plugin.Installed {
			refreshes = append(refreshes, plugin)
		}
	}
	sort.Slice(refreshes, func(left int, right int) bool {
		leftIsManager := refreshes[left].Name == managerPlugin
		rightIsManager := refreshes[right].Name == managerPlugin
		if leftIsManager != rightIsManager {
			return !leftIsManager
		}
		return refreshes[left].ID < refreshes[right].ID
	})
	return refreshes
}

func ShouldCheck(state State, now time.Time, successInterval time.Duration, retryInterval time.Duration) bool {
	if state.LastStatus == StatusFailed || state.LastStatus == StatusStarted {
		return state.LastAttemptedAt.IsZero() || now.Sub(state.LastAttemptedAt) >= retryInterval
	}
	return state.LastCheckedAt.IsZero() || now.Sub(state.LastCheckedAt) >= successInterval
}
