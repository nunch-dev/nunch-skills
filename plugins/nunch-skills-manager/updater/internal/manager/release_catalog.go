package manager

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"slices"
)

type releaseMarketplace struct {
	Plugins []releaseMarketplacePlugin `json:"plugins"`
}

type releaseMarketplacePlugin struct {
	Name   string                   `json:"name"`
	Source releaseMarketplaceSource `json:"source"`
}

type releaseMarketplaceSource struct {
	Source string `json:"source"`
	Path   string `json:"path"`
}

func ReadVerifiedPluginCatalog(
	ctx context.Context,
	manifest ReleaseManifest,
	git GitContentSource,
) ([]ReleasePlugin, error) {
	data, err := git.ReadFile(ctx, manifest.Marketplace.Path)
	if err != nil {
		return nil, verificationError("git", manifest.Marketplace.Path, "read catalog failed", err)
	}
	var marketplace releaseMarketplace
	if err := json.Unmarshal(data, &marketplace); err != nil {
		return nil, verificationError("git", manifest.Marketplace.Path, "catalog JSON is invalid", err)
	}
	catalog := make([]ReleasePlugin, 0, len(marketplace.Plugins))
	for _, entry := range marketplace.Plugins {
		if entry.Name == "" || entry.Source.Source != "local" || !validPluginSourcePath(entry.Source.Path) {
			return nil, verificationError("git", manifest.Marketplace.Path, "catalog entry is invalid", nil)
		}
		pluginPath := path.Join(entry.Source.Path[2:], ".codex-plugin", "plugin.json")
		pluginData, readErr := git.ReadFile(ctx, pluginPath)
		if readErr != nil {
			return nil, verificationError("git", pluginPath, "read plugin manifest failed", readErr)
		}
		var plugin ReleasePlugin
		if err := json.Unmarshal(pluginData, &plugin); err != nil {
			return nil, verificationError("git", pluginPath, "plugin manifest is invalid", err)
		}
		if plugin.Name != entry.Name || !validSemver(plugin.Version) {
			return nil, verificationError("git", pluginPath, "plugin identity is invalid", nil)
		}
		catalog = append(catalog, plugin)
	}
	slices.SortFunc(catalog, func(left, right ReleasePlugin) int {
		if left.Name < right.Name {
			return -1
		}
		if left.Name > right.Name {
			return 1
		}
		return 0
	})
	if !slices.Equal(catalog, manifest.Plugins) {
		return nil, verificationError("git", manifest.Marketplace.Path, "catalog differs from release manifest", nil)
	}
	return catalog, nil
}

func validPluginSourcePath(value string) bool {
	return len(value) > 2 && value[:2] == "./" && validReleasePath(value[2:]) &&
		path.Dir(value[2:]) == "plugins"
}

func catalogVersion(catalog []ReleasePlugin, name string) (string, error) {
	for _, plugin := range catalog {
		if plugin.Name == name {
			return plugin.Version, nil
		}
	}
	return "", fmt.Errorf("installed plugin %s is absent from verified catalog", name)
}
