package manager

import (
	"context"
	"errors"
	"fmt"
	"os"
)

var ErrReleaseVersionReuse = errors.New("npm release version resolves to a different Git commit")

const (
	defaultNPMRegistry = "https://registry.npmjs.org"
	defaultGitRemote   = "https://github.com/nunch-dev/nunch-skills.git"
)

type ProductionReleaseSource struct {
	registry   *NPMRegistryClient
	gitRunner  Runner
	codex      Config
	codexRun   Runner
	gitRemote  string
	tempParent string
}

type ProductionReleaseSourceConfig struct {
	Registry   *NPMRegistryClient
	GitRunner  Runner
	Codex      Config
	CodexRun   Runner
	GitRemote  string
	TempParent string
}

func NewProductionReleaseSource(config ProductionReleaseSourceConfig) *ProductionReleaseSource {
	return &ProductionReleaseSource{
		registry: config.Registry, gitRunner: config.GitRunner, codex: config.Codex,
		codexRun: config.CodexRun, gitRemote: config.GitRemote, tempParent: config.TempParent,
	}
}

func (source *ProductionReleaseSource) DiscoverAndVerify(
	ctx context.Context,
	current *ReleaseState,
) (candidate AutoReleaseCandidate, found bool, returnErr error) {
	npm, err := source.registry.FetchLatest(ctx, "@nunch-dev/skills")
	if err != nil {
		return AutoReleaseCandidate{}, false, err
	}
	accepted, err := acceptsAutomaticRelease(current, npm.Manifest)
	if err != nil {
		return AutoReleaseCandidate{}, false, err
	}
	if !accepted {
		return AutoReleaseCandidate{}, false, nil
	}
	verified, catalog, err := source.verifyNPMRelease(ctx, npm.Manifest, npm)
	if err != nil {
		return AutoReleaseCandidate{}, false, err
	}
	installed, err := listMarketplacePlugins(ctx, source.codex, source.codexRun)
	if err != nil {
		return AutoReleaseCandidate{}, false, fmt.Errorf("list installed plugins after release verification: %w", err)
	}
	plugins, err := buildAutoReleasePlugins(installed, catalog, source.codex)
	if err != nil {
		return AutoReleaseCandidate{}, false, err
	}
	return AutoReleaseCandidate{Release: verified, Manifest: npm.Manifest, Plugins: plugins}, true, nil
}

func acceptsAutomaticRelease(current *ReleaseState, manifest ReleaseManifest) (bool, error) {
	if current == nil {
		return stableVersionParts(manifest.NPM.Version) != nil, nil
	}
	if current.Version == manifest.NPM.Version {
		if current.Commit != manifest.Git.Commit {
			return false, ErrReleaseVersionReuse
		}
		return false, nil
	}
	return IsStrictStableUpgrade(current.Version, manifest.NPM.Version)
}

func (source *ProductionReleaseSource) VerifyPackaged(
	ctx context.Context,
	manifest ReleaseManifest,
) (VerifiedRelease, error) {
	npm, err := source.registry.Fetch(ctx, manifest.NPM.Name, manifest.NPM.Version)
	if err != nil {
		return VerifiedRelease{}, err
	}
	verified, _, err := source.verifyNPMRelease(ctx, manifest, npm)
	return verified, err
}

func (source *ProductionReleaseSource) verifyNPMRelease(
	ctx context.Context,
	manifest ReleaseManifest,
	npm NPMRelease,
) (verified VerifiedRelease, catalog []ReleasePlugin, returnErr error) {
	root, err := os.MkdirTemp(source.tempParent, "nunch-skills-release-")
	if err != nil {
		return VerifiedRelease{}, nil, fmt.Errorf("create release verification directory: %w", err)
	}
	defer func() { returnErr = errors.Join(returnErr, os.RemoveAll(root)) }()
	git, err := FetchGitRelease(ctx, source.gitRunner, source.gitRemote, root, manifest.Git.Tag)
	if err != nil {
		return VerifiedRelease{}, nil, err
	}
	verified, err = VerifyRelease(ctx, manifest, npm, git)
	if err != nil {
		return VerifiedRelease{}, nil, err
	}
	catalog, err = ReadVerifiedPluginCatalog(ctx, manifest, git)
	if err != nil {
		return VerifiedRelease{}, nil, err
	}
	return verified, catalog, nil
}

func buildAutoReleasePlugins(
	installed PluginList,
	catalog []ReleasePlugin,
	config Config,
) ([]AutoReleasePlugin, error) {
	plugins := make([]AutoReleasePlugin, 0, len(installed.Installed))
	for _, plugin := range installed.Installed {
		if !plugin.Installed || plugin.MarketplaceName != config.Marketplace {
			continue
		}
		version, err := catalogVersion(catalog, plugin.Name)
		if err != nil {
			return nil, err
		}
		plugins = append(plugins, AutoReleasePlugin{
			ID: plugin.ID, Name: plugin.Name, FromVersion: plugin.Version, Version: version,
		})
	}
	return plugins, nil
}
