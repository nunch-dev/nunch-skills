package manager

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"runtime"
	"slices"
	"strings"
)

func (mutator *ProductionAutoReleaseMutator) marketplaceCommit(ctx context.Context) (string, error) {
	root, found, err := mutator.marketplaceRoot(ctx)
	if err != nil {
		return "", err
	}
	if !found {
		return "", ErrMarketplaceReleaseMismatch
	}
	commit, err := mutator.runner.Run(ctx, "git", "-C", root, "rev-parse", "HEAD")
	if err != nil {
		return "", fmt.Errorf("inspect marketplace release commit: %w", err)
	}
	return strings.TrimSpace(string(commit)), nil
}

func (mutator *ProductionAutoReleaseMutator) marketplaceRoot(ctx context.Context) (string, bool, error) {
	raw, err := mutator.runner.Run(
		ctx, mutator.config.CodexCommand, "plugin", "marketplace", "list", "--json",
	)
	if err != nil {
		return "", false, fmt.Errorf("list marketplace for release snapshot: %w", err)
	}
	var list marketplaceList
	if err := json.Unmarshal(raw, &list); err != nil {
		return "", false, fmt.Errorf("decode marketplace for release snapshot: %w", err)
	}
	for _, marketplace := range list.Marketplaces {
		if marketplace.Name == mutator.config.Marketplace {
			return marketplace.Root, true, nil
		}
	}
	return "", false, nil
}

func (mutator *ProductionAutoReleaseMutator) repinMarketplace(ctx context.Context, commit string) error {
	if !hexCommitPattern.MatchString(commit) {
		return ErrMarketplaceReleaseMismatch
	}
	_, exists, err := mutator.marketplaceRoot(ctx)
	if err != nil {
		return err
	}
	if exists {
		if _, err := mutator.runner.Run(
			ctx, mutator.config.CodexCommand, "plugin", "marketplace", "remove", mutator.config.Marketplace, "--json",
		); err != nil {
			return fmt.Errorf("remove marketplace before exact repin: %w", err)
		}
	}
	if _, err := mutator.runner.Run(
		ctx, mutator.config.CodexCommand, "plugin", "marketplace", "add",
		defaultMarketplaceSource, "--ref", commit, "--json",
	); err != nil {
		return fmt.Errorf("add exact marketplace release: %w", err)
	}
	return nil
}

func (mutator *ProductionAutoReleaseMutator) verifiedInstalledHook(
	ctx context.Context,
	manifest ReleaseManifest,
) (VerifiedManagerHook, string, error) {
	plugins, err := listMarketplacePlugins(ctx, mutator.config, mutator.runner)
	if err != nil {
		return VerifiedManagerHook{}, "", err
	}
	plugin, found := findPlugin(plugins, mutator.config.ManagerPlugin)
	if !found || !plugin.Installed {
		return VerifiedManagerHook{}, "", ErrManagerHookMismatch
	}
	hook, err := VerifyInstalledManagerRelease(plugin.Source.Path, manifest, runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return VerifiedManagerHook{}, "", err
	}
	current, exists, err := InspectTrustHash(mutator.configPath, hook.TrustID)
	if err != nil {
		return VerifiedManagerHook{}, "", err
	}
	if !exists {
		current = ""
	}
	return hook, current, nil
}

func (mutator *ProductionAutoReleaseMutator) Rollback(
	ctx context.Context,
	operationID string,
	release ReleaseState,
) error {
	if !releaseOperationIDPattern.MatchString(operationID) {
		return errors.New("release rollback operation ID is invalid")
	}
	raw, err := os.ReadFile(mutator.snapshotPath(operationID))
	if err != nil {
		return fmt.Errorf("read release rollback snapshot: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var snapshot releaseSnapshot
	if err := decoder.Decode(&snapshot); err != nil {
		return fmt.Errorf("decode release rollback snapshot: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return err
	}
	if snapshot.Commit != release.Commit || !hexCommitPattern.MatchString(snapshot.Commit) {
		return errors.New("release rollback snapshot does not match last-known-good")
	}
	if err := mutator.repinMarketplace(ctx, snapshot.Commit); err != nil {
		return err
	}
	if err := mutator.restorePlugins(ctx, snapshot.Plugins); err != nil {
		return err
	}
	if err := mutator.restoreTrust(snapshot.Trust); err != nil {
		return err
	}
	if err := os.Remove(mutator.snapshotPath(operationID)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove rolled-back release snapshot: %w", err)
	}
	mutator.active = ""
	return nil
}

func (mutator *ProductionAutoReleaseMutator) restorePlugins(ctx context.Context, plugins []Plugin) error {
	for _, plugin := range managerLastSnapshot(plugins, mutator.config.ManagerPlugin) {
		raw, err := mutator.runner.Run(ctx, mutator.config.CodexCommand, "plugin", "add", plugin.ID, "--json")
		if err != nil {
			return fmt.Errorf("restore plugin %s: %w", plugin.ID, err)
		}
		result, err := ParseInstallResult(raw)
		if err != nil || result.PluginID != plugin.ID || result.Version != plugin.Version {
			return verificationError("rollback", plugin.ID, "restored plugin version mismatch", err)
		}
	}
	return nil
}

func (mutator *ProductionAutoReleaseMutator) restoreTrust(trust string) error {
	current, found, err := InspectTrustHash(mutator.configPath, ManagerHookTrustID)
	if err != nil {
		return err
	}
	if trust == "" {
		if found {
			return mutator.trust.Remove(ManagerHookTrustID, current)
		}
		return nil
	}
	expected := ""
	if found {
		expected = current
	}
	return mutator.trust.Upsert(ManagerHookTrustID, expected, trust)
}

func managerLastSnapshot(plugins []Plugin, managerName string) []Plugin {
	ordered := append([]Plugin(nil), plugins...)
	slices.SortFunc(ordered, func(left, right Plugin) int {
		if left.Name == managerName && right.Name != managerName {
			return 1
		}
		if right.Name == managerName && left.Name != managerName {
			return -1
		}
		return strings.Compare(left.ID, right.ID)
	})
	return ordered
}
