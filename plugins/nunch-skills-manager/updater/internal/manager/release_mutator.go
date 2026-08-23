package manager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

var releaseOperationIDPattern = regexp.MustCompile(`^[0-9A-Za-z.+_-]+$`)

type releaseSnapshot struct {
	Commit  string   `json:"commit"`
	Plugins []Plugin `json:"plugins"`
	Trust   string   `json:"trust,omitempty"`
}

type ProductionAutoReleaseMutator struct {
	config       Config
	runner       Runner
	configPath   string
	snapshotRoot string
	trust        *TrustEditor
	active       string
}

func NewProductionAutoReleaseMutator(
	config Config,
	runner Runner,
	configPath string,
	snapshotRoot string,
) *ProductionAutoReleaseMutator {
	return &ProductionAutoReleaseMutator{
		config: config, runner: runner, configPath: configPath,
		snapshotRoot: snapshotRoot, trust: NewTrustEditor(configPath),
	}
}

func (mutator *ProductionAutoReleaseMutator) Snapshot(ctx context.Context, operationID string) error {
	if !releaseOperationIDPattern.MatchString(operationID) {
		return errors.New("release snapshot operation ID is invalid")
	}
	commit, err := mutator.marketplaceCommit(ctx)
	if err != nil {
		return err
	}
	plugins, err := listMarketplacePlugins(ctx, mutator.config, mutator.runner)
	if err != nil {
		return err
	}
	installed := make([]Plugin, 0, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		if plugin.Installed && plugin.MarketplaceName == mutator.config.Marketplace {
			installed = append(installed, plugin)
		}
	}
	trust, found, err := InspectTrustHash(mutator.configPath, ManagerHookTrustID)
	if err != nil {
		return err
	}
	if !found {
		trust = ""
	}
	raw, err := json.Marshal(releaseSnapshot{Commit: commit, Plugins: installed, Trust: trust})
	if err != nil {
		return fmt.Errorf("encode release snapshot: %w", err)
	}
	path := mutator.snapshotPath(operationID)
	if err := writeFileAtomic(path, append(raw, '\n')); err != nil {
		return fmt.Errorf("write release snapshot: %w", err)
	}
	mutator.active = operationID
	return nil
}

func (mutator *ProductionAutoReleaseMutator) PinMarketplace(
	ctx context.Context,
	candidate AutoReleaseCandidate,
) error {
	return mutator.repinMarketplace(ctx, candidate.Release.Commit)
}

func (mutator *ProductionAutoReleaseMutator) UpdatePlugin(
	ctx context.Context,
	plugin AutoReleasePlugin,
) error {
	raw, err := mutator.runner.Run(ctx, mutator.config.CodexCommand, "plugin", "add", plugin.ID, "--json")
	if err != nil {
		return err
	}
	result, err := ParseInstallResult(raw)
	if err != nil {
		return err
	}
	if result.PluginID != plugin.ID || result.Version != plugin.Version {
		return verificationError("codex", plugin.ID, "installed version differs from verified catalog", nil)
	}
	return nil
}

func (mutator *ProductionAutoReleaseMutator) UpdateExactTrust(
	ctx context.Context,
	candidate AutoReleaseCandidate,
) error {
	hook, current, err := mutator.verifiedInstalledHook(ctx, candidate.Manifest)
	if err != nil {
		return err
	}
	return mutator.trust.Upsert(hook.TrustID, current, hook.TrustHash)
}

func (mutator *ProductionAutoReleaseMutator) VerifyFinal(
	ctx context.Context,
	candidate AutoReleaseCandidate,
) error {
	commit, err := mutator.marketplaceCommit(ctx)
	if err != nil {
		return err
	}
	if commit != candidate.Release.Commit {
		return ErrMarketplaceReleaseMismatch
	}
	plugins, err := listMarketplacePlugins(ctx, mutator.config, mutator.runner)
	if err != nil {
		return err
	}
	installed := installedByName(plugins)
	for _, expected := range candidate.Plugins {
		actual, found := installed[expected.Name]
		if !found || actual.Version != expected.Version {
			return verificationError("codex", expected.ID, "final plugin version mismatch", nil)
		}
	}
	hook, current, err := mutator.verifiedInstalledHook(ctx, candidate.Manifest)
	if err != nil {
		return err
	}
	if current != hook.TrustHash {
		return verificationError("codex", ManagerHookTrustID, "final hook trust mismatch", nil)
	}
	return nil
}

func (mutator *ProductionAutoReleaseMutator) Commit(operationID string) error {
	if !releaseOperationIDPattern.MatchString(operationID) || mutator.active != operationID {
		return errors.New("release snapshot operation does not match commit")
	}
	if err := os.Remove(mutator.snapshotPath(operationID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	mutator.active = ""
	return nil
}

func (mutator *ProductionAutoReleaseMutator) snapshotPath(operationID string) string {
	return filepath.Join(mutator.snapshotRoot, operationID+".json")
}
