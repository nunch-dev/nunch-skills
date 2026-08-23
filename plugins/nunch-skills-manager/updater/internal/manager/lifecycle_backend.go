package manager

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"runtime"
	"strings"
)

const defaultMarketplaceSource = "nunch-dev/nunch-skills"

var ErrMarketplaceReleaseMismatch = errors.New("marketplace is not pinned to the verified release")

type CodexLifecycleBackend struct {
	config     Config
	runner     Runner
	trust      *TrustEditor
	configPath string
	root       string
}

type marketplaceList struct {
	Marketplaces []marketplaceEntry `json:"marketplaces"`
}

type marketplaceEntry struct {
	Name string `json:"name"`
	Root string `json:"root"`
}

func NewCodexLifecycleBackend(config Config, runner Runner, configPath string) *CodexLifecycleBackend {
	return &CodexLifecycleBackend{
		config: config, runner: runner, trust: NewTrustEditor(configPath), configPath: configPath,
	}
}

func (backend *CodexLifecycleBackend) Marketplace(ctx context.Context) (bool, error) {
	raw, err := backend.runner.Run(ctx, backend.config.CodexCommand, "plugin", "marketplace", "list", "--json")
	if err != nil {
		return false, fmt.Errorf("list Codex marketplaces: %w", err)
	}
	var list marketplaceList
	if err := json.Unmarshal(raw, &list); err != nil {
		return false, fmt.Errorf("decode Codex marketplaces: %w", err)
	}
	for _, marketplace := range list.Marketplaces {
		if marketplace.Name == backend.config.Marketplace {
			backend.root = marketplace.Root
			return true, nil
		}
	}
	return false, nil
}

func (backend *CodexLifecycleBackend) PinMarketplace(ctx context.Context, commit string) error {
	if backend.root != "" {
		raw, err := backend.runner.Run(ctx, "git", "-C", backend.root, "rev-parse", "HEAD")
		if err != nil {
			return fmt.Errorf("inspect marketplace commit: %w", err)
		}
		if strings.TrimSpace(string(raw)) != commit {
			return ErrMarketplaceReleaseMismatch
		}
		return nil
	}
	_, err := backend.runner.Run(
		ctx,
		backend.config.CodexCommand,
		"plugin", "marketplace", "add", defaultMarketplaceSource, "--ref", commit, "--json",
	)
	if err != nil {
		return fmt.Errorf("add pinned marketplace: %w", err)
	}
	return nil
}

func (backend *CodexLifecycleBackend) Plugins(ctx context.Context) (PluginList, error) {
	return listMarketplacePlugins(ctx, backend.config, backend.runner)
}

func (backend *CodexLifecycleBackend) Install(ctx context.Context, name string) error {
	id := name + "@" + backend.config.Marketplace
	raw, err := backend.runner.Run(ctx, backend.config.CodexCommand, "plugin", "add", id, "--json")
	if err != nil {
		return err
	}
	result, err := ParseInstallResult(raw)
	if err != nil {
		return err
	}
	if result.PluginID != id {
		return &ParseError{Reason: "installed plugin identity changed"}
	}
	return nil
}

func (backend *CodexLifecycleBackend) Trust(
	ctx context.Context,
	manifest ReleaseManifest,
	expected Ownership,
	expectedHash string,
) error {
	ownership, hash, err := backend.TrustIntent(ctx, manifest)
	if err != nil {
		return err
	}
	if expected != "" && (ownership != expected || hash != expectedHash) {
		return ErrTrustConflict
	}
	if ownership == OwnershipPreExisting {
		return nil
	}
	return backend.trust.Upsert(ManagerHookTrustID, "", hash)
}

func (backend *CodexLifecycleBackend) TrustIntent(
	ctx context.Context,
	manifest ReleaseManifest,
) (Ownership, string, error) {
	plugins, err := backend.Plugins(ctx)
	if err != nil {
		return "", "", err
	}
	managerPlugin, found := findPlugin(plugins, backend.config.ManagerPlugin)
	if !found || !managerPlugin.Installed {
		return "", "", fmt.Errorf("installed manager plugin is missing: %w", ErrManagerHookMismatch)
	}
	hook, err := VerifyInstalledManagerRelease(
		managerPlugin.Source.Path, manifest, runtime.GOOS, runtime.GOARCH,
	)
	if err != nil {
		return "", "", err
	}
	current, exists, err := InspectTrustHash(backend.configPath, hook.TrustID)
	if err != nil {
		return "", "", err
	}
	if exists {
		if current != hook.TrustHash {
			return "", "", ErrTrustConflict
		}
		return OwnershipPreExisting, hook.TrustHash, nil
	}
	return OwnershipCreated, hook.TrustHash, nil
}

func (backend *CodexLifecycleBackend) RemovePlugin(ctx context.Context, id string) error {
	plugins, err := backend.Plugins(ctx)
	if err != nil {
		return err
	}
	installed := false
	for _, plugin := range plugins.Installed {
		if plugin.ID == id && plugin.Installed {
			installed = true
			break
		}
	}
	if !installed {
		return nil
	}
	_, err = backend.runner.Run(ctx, backend.config.CodexCommand, "plugin", "remove", id, "--json")
	return err
}

func (backend *CodexLifecycleBackend) RemoveTrust(_ context.Context, expectedHash string) error {
	current, found, err := InspectTrustHash(backend.configPath, ManagerHookTrustID)
	if err != nil {
		return err
	}
	if !found {
		return nil
	}
	if current != expectedHash {
		return ErrTrustConflict
	}
	return backend.trust.Remove(ManagerHookTrustID, expectedHash)
}

func (backend *CodexLifecycleBackend) RemoveMarketplace(ctx context.Context) error {
	exists, err := backend.Marketplace(ctx)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}
	_, err = backend.runner.Run(
		ctx,
		backend.config.CodexCommand,
		"plugin", "marketplace", "remove", backend.config.Marketplace, "--json",
	)
	return err
}

func findPlugin(plugins PluginList, name string) (Plugin, bool) {
	for _, plugin := range plugins.Installed {
		if plugin.Name == name {
			if plugin.Source.Path != "" && filepath.IsAbs(plugin.Source.Path) {
				return plugin, true
			}
			return Plugin{}, false
		}
	}
	return Plugin{}, false
}
