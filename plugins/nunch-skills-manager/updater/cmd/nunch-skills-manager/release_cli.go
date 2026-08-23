package main

import (
	"context"
	"encoding/json"
	"io"
	"os"

	"github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager"
)

func runForegroundUpdate(
	config manager.RuntimeConfig,
	codexHome string,
	command manager.LifecycleCommand,
	stdout, stderr io.Writer,
) int {
	autoRelease, err := manager.NewProductionAutoRelease(config, codexHome, os.Getenv)
	if err != nil {
		return writeError(stderr, err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	if command.DryRun {
		return previewForegroundUpdate(ctx, autoRelease, codexHome, stdout, stderr)
	}
	result, err := autoRelease.Updater.Run(ctx)
	if err != nil {
		return writeError(stderr, err)
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return writeError(stderr, err)
	}
	return 0
}

func previewForegroundUpdate(
	ctx context.Context,
	autoRelease *manager.ProductionAutoRelease,
	codexHome string,
	stdout, stderr io.Writer,
) int {
	state, err := manager.NewLifecycleStore(manager.NewLifecyclePaths(codexHome).State).Load()
	if err != nil {
		return writeError(stderr, err)
	}
	candidate, found, err := autoRelease.Source.DiscoverAndVerify(ctx, state.LastKnownGood)
	if err != nil {
		return writeError(stderr, err)
	}
	result := manager.LifecycleResult{Command: manager.LifecycleUpdate, DryRun: true}
	if found {
		for _, plugin := range candidate.Plugins {
			result.Targets = append(result.Targets, plugin.ID)
		}
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return writeError(stderr, err)
	}
	return 0
}
