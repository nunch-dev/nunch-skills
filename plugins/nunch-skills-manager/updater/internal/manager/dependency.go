package manager

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
)

type DependencyInitialization struct {
	Changed bool
	Report  DependencyReport
}

func InspectDependencies(ctx context.Context, plugins PluginList, runner Runner) (DependencyReport, error) {
	specs, manual, err := loadDependencyDeclarations(plugins)
	if err != nil {
		return DependencyReport{}, err
	}
	missing := make([]DependencyIssue, 0, len(specs))
	for _, spec := range specs {
		if dependencyAvailable(ctx, spec, runner) {
			continue
		}
		missing = append(missing, DependencyIssue{
			Name: spec.declaration.Name, Requirement: spec.declaration.Requirement, RequiredBy: spec.requiredBy,
		})
	}
	return DependencyReport{Missing: missing, Manual: manual}, nil
}

func InspectDependencyInitialization(
	ctx context.Context,
	config Config,
	runner Runner,
	store Store,
) (DependencyInitialization, error) {
	plugins, err := listMarketplacePlugins(ctx, config, runner)
	if err != nil {
		return DependencyInitialization{}, err
	}
	signature := dependencySignature(plugins)
	state, err := store.Load()
	if err != nil {
		return DependencyInitialization{}, fmt.Errorf("load dependency initialization state: %w", err)
	}
	if state.DependencySignature == signature {
		return DependencyInitialization{}, nil
	}
	report, err := InspectDependencies(ctx, plugins, runner)
	if err != nil {
		return DependencyInitialization{}, err
	}
	state.DependencySignature = signature
	if err := store.Save(state); err != nil {
		return DependencyInitialization{}, fmt.Errorf("save dependency initialization state: %w", err)
	}
	return DependencyInitialization{Changed: true, Report: report}, nil
}

func DiagnoseDependencies(ctx context.Context, config Config, runner Runner) (DependencyReport, error) {
	plugins, err := listMarketplacePlugins(ctx, config, runner)
	if err != nil {
		return DependencyReport{}, err
	}
	return InspectDependencies(ctx, plugins, runner)
}

func FormatDependencyGuidance(report DependencyReport) string {
	if len(report.Missing) == 0 && len(report.Manual) == 0 {
		return "[nunch-skills] Initialization check completed: all declared dependencies are available."
	}
	parts := make([]string, 0, 2)
	if len(report.Missing) > 0 {
		items := make([]string, 0, len(report.Missing))
		for _, issue := range report.Missing {
			items = append(items, fmt.Sprintf("%s for %s", issue.Requirement, strings.Join(issue.RequiredBy, ", ")))
		}
		parts = append(parts, "Missing dependencies: "+strings.Join(items, "; ")+
			". Ask Codex to install nunch-skills dependencies.")
	}
	if len(report.Manual) > 0 {
		items := make([]string, 0, len(report.Manual))
		for _, dependency := range report.Manual {
			items = append(items, fmt.Sprintf("%s for %s", dependency.Name, strings.Join(dependency.RequiredBy, ", ")))
		}
		parts = append(parts, "Manual setup: "+strings.Join(items, "; ")+".")
	}
	return "[nunch-skills] Initialization required. " + strings.Join(parts, " ")
}

func listMarketplacePlugins(ctx context.Context, config Config, runner Runner) (PluginList, error) {
	raw, err := runner.Run(ctx, config.CodexCommand,
		"plugin", "list", "--marketplace", config.Marketplace, "--json", "--available")
	if err != nil {
		return PluginList{}, fmt.Errorf("list marketplace plugins: %w", err)
	}
	plugins, err := ParsePluginList(raw)
	if err != nil {
		return PluginList{}, err
	}
	return plugins, nil
}

func dependencySignature(plugins PluginList) string {
	identities := make([]string, 0, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		if plugin.Installed {
			identities = append(identities, plugin.ID+"@"+plugin.Version)
		}
	}
	sort.Strings(identities)
	digest := sha256.Sum256([]byte(strings.Join(identities, "\n")))
	return hex.EncodeToString(digest[:])
}

func dependencyAvailable(ctx context.Context, spec dependencySpec, runner Runner) bool {
	for _, candidate := range spec.declaration.Candidates {
		output, err := runner.Run(ctx, candidate, spec.declaration.VersionArgs...)
		if err == nil && versionMeetsMinimum(output, spec.declaration.VersionPrefix, spec.minimum) {
			return true
		}
	}
	return false
}
