package manager

import (
	"context"
	"errors"
	"fmt"
)

type Manager struct {
	config Config
	runner Runner
	store  Store
	clock  Clock
}

func New(config Config, runner Runner, store Store, clock Clock) *Manager {
	return &Manager{config: config, runner: runner, store: store, clock: clock}
}

func (manager *Manager) Run(ctx context.Context) (Result, error) {
	state, err := manager.store.Load()
	if err != nil {
		return Result{}, fmt.Errorf("load updater state: %w", err)
	}
	now := manager.clock.Now()
	state.LastAttemptedAt = now
	state.LastStatus = StatusStarted
	if err := manager.store.Save(state); err != nil {
		return Result{}, fmt.Errorf("save updater start state: %w", err)
	}

	before, err := manager.listPlugins(ctx)
	if err != nil {
		return Result{}, manager.recordFailure(state, err)
	}
	if _, err := manager.runner.Run(ctx, manager.config.CodexCommand,
		"plugin", "marketplace", "upgrade", manager.config.Marketplace, "--json"); err != nil {
		return Result{}, manager.recordFailure(state, fmt.Errorf("upgrade marketplace: %w", err))
	}
	updates := make([]Update, 0, len(before.Installed))
	for _, installed := range PlanRefreshes(before, manager.config.ManagerPlugin) {
		raw, err := manager.runner.Run(ctx, manager.config.CodexCommand,
			"plugin", "add", installed.ID, "--json")
		if err != nil {
			return Result{}, manager.recordFailure(state, fmt.Errorf("refresh plugin %s: %w", installed.ID, err))
		}
		result, err := ParseInstallResult(raw)
		if err != nil {
			return Result{}, manager.recordFailure(state, err)
		}
		if result.PluginID != installed.ID {
			return Result{}, manager.recordFailure(state, &ParseError{Reason: "plugin install result identity changed"})
		}
		if result.Version != installed.Version {
			updates = append(updates, Update{
				PluginID:    installed.ID,
				FromVersion: installed.Version,
				ToVersion:   result.Version,
			})
		}
	}

	state.LastCheckedAt = now
	state.LastStatus = StatusSuccess
	state.LastError = ""
	after, err := manager.listPlugins(ctx)
	if err != nil {
		return Result{}, manager.recordFailure(state, err)
	}
	dependencyReport, err := InspectDependencies(ctx, after, manager.runner)
	if err != nil {
		return Result{}, manager.recordFailure(state, fmt.Errorf("inspect dependencies: %w", err))
	}
	dependencies := dependencyReport.Missing
	if len(updates) > 0 || len(dependencies) > 0 {
		state.PendingNotice = &PendingNotice{
			Updates: updates, Dependencies: dependencies, CompletedAt: now,
		}
	}
	if err := manager.store.Save(state); err != nil {
		return Result{}, fmt.Errorf("save updater success state: %w", err)
	}
	return Result{Updates: updates}, nil
}

func (manager *Manager) listPlugins(ctx context.Context) (PluginList, error) {
	return listMarketplacePlugins(ctx, manager.config, manager.runner)
}

func (manager *Manager) recordFailure(state State, cause error) error {
	state.LastStatus = StatusFailed
	state.LastError = sanitizeError(cause)
	if err := manager.store.Save(state); err != nil {
		return errors.Join(cause, fmt.Errorf("save updater failure state: %w", err))
	}
	return cause
}

func sanitizeError(cause error) string {
	message := cause.Error()
	if len(message) > 400 {
		return message[:400]
	}
	return message
}
