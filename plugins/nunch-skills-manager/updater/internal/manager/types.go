// Package manager refreshes the nunch-skills Codex marketplace and updates
// only plugins that were already installed by the user.
package manager

import (
	"context"
	"time"
)

type Status string

const (
	StatusStarted Status = "started"
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
)

type Config struct {
	CodexCommand  string
	Marketplace   string
	ManagerPlugin string
}

type Plugin struct {
	ID              string `json:"pluginId"`
	Name            string `json:"name"`
	MarketplaceName string `json:"marketplaceName"`
	Version         string `json:"version"`
	Installed       bool   `json:"installed"`
	Enabled         bool   `json:"enabled"`
}

type PluginList struct {
	Installed []Plugin `json:"installed"`
}

type Update struct {
	PluginID    string `json:"pluginId"`
	FromVersion string `json:"fromVersion"`
	ToVersion   string `json:"toVersion"`
}

type InstallResult struct {
	PluginID string `json:"pluginId"`
	Name     string `json:"name"`
	Version  string `json:"version"`
}

type PendingNotice struct {
	Updates      []Update          `json:"updates,omitempty"`
	Dependencies []DependencyIssue `json:"dependencies,omitempty"`
	CompletedAt  time.Time         `json:"completedAt"`
}

type State struct {
	LastCheckedAt   time.Time      `json:"lastCheckedAt,omitempty"`
	LastAttemptedAt time.Time      `json:"lastAttemptedAt,omitempty"`
	LastStatus      Status         `json:"lastStatus,omitempty"`
	LastError       string         `json:"lastError,omitempty"`
	PendingNotice   *PendingNotice `json:"pendingNotice,omitempty"`
}

type Result struct {
	Updates []Update
}

type Runner interface {
	Run(ctx context.Context, name string, args ...string) ([]byte, error)
}

type Store interface {
	Load() (State, error)
	Save(state State) error
}

type Clock interface {
	Now() time.Time
}
