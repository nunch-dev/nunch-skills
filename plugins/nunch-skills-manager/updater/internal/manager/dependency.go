package manager

import (
	"context"
	"fmt"
	"sort"
	"strings"
)

type DependencyIssue struct {
	Name        string   `json:"name"`
	Requirement string   `json:"requirement"`
	RequiredBy  []string `json:"requiredBy"`
}

type ManualDependency struct {
	Name       string   `json:"name"`
	RequiredBy []string `json:"requiredBy"`
}

type DependencyReport struct {
	Missing []DependencyIssue  `json:"missing"`
	Manual  []ManualDependency `json:"manual"`
}

type dependencySpec struct {
	name        string
	requirement string
	plugins     []string
	commands    []dependencyCommand
	check       func([]byte) bool
}

type dependencyCommand struct {
	name string
	args []string
}

var dependencySpecs = []dependencySpec{
	{
		name:        "python3",
		requirement: "Python 3.11+",
		plugins:     []string{"deep-interview", "humanize-korean"},
		commands: []dependencyCommand{
			{name: "python3", args: []string{"--version"}},
			{name: "python", args: []string{"--version"}},
		},
		check: supportsPython311,
	},
	{
		name:        "uv",
		requirement: "uv",
		plugins:     []string{"deep-interview"},
		commands:    []dependencyCommand{{name: "uv", args: []string{"--version"}}},
		check:       acceptsAnyVersion,
	},
	{
		name:        "git",
		requirement: "Git",
		plugins:     []string{"git-tools"},
		commands:    []dependencyCommand{{name: "git", args: []string{"--version"}}},
		check:       acceptsAnyVersion,
	},
}

func CheckDependencies(ctx context.Context, plugins PluginList, runner Runner) []DependencyIssue {
	installed := make(map[string]bool, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		if plugin.Installed {
			installed[plugin.Name] = true
		}
	}

	issues := make([]DependencyIssue, 0)
	for _, spec := range dependencySpecs {
		requiredBy := make([]string, 0, len(spec.plugins))
		for _, plugin := range spec.plugins {
			if installed[plugin] {
				requiredBy = append(requiredBy, plugin)
			}
		}
		if len(requiredBy) == 0 {
			continue
		}
		sort.Strings(requiredBy)
		if dependencyAvailable(ctx, spec, runner) {
			continue
		}
		issues = append(issues, DependencyIssue{
			Name:        spec.name,
			Requirement: spec.requirement,
			RequiredBy:  requiredBy,
		})
	}
	return issues
}

func dependencyAvailable(ctx context.Context, spec dependencySpec, runner Runner) bool {
	for _, command := range spec.commands {
		output, err := runner.Run(ctx, command.name, command.args...)
		if err == nil && spec.check(output) {
			return true
		}
	}
	return false
}

func DiagnoseDependencies(ctx context.Context, config Config, runner Runner) (DependencyReport, error) {
	raw, err := runner.Run(ctx, config.CodexCommand,
		"plugin", "list", "--marketplace", config.Marketplace, "--json", "--available")
	if err != nil {
		return DependencyReport{}, fmt.Errorf("list marketplace plugins: %w", err)
	}
	plugins, err := ParsePluginList(raw)
	if err != nil {
		return DependencyReport{}, err
	}
	report := DependencyReport{
		Missing: CheckDependencies(ctx, plugins, runner),
		Manual:  make([]ManualDependency, 0),
	}
	for _, plugin := range plugins.Installed {
		if plugin.Installed && plugin.Name == "kaneo-skills" {
			report.Manual = append(report.Manual, ManualDependency{
				Name: "Kaneo MCP", RequiredBy: []string{"kaneo-skills"},
			})
		}
	}
	return report, nil
}

func supportsPython311(output []byte) bool {
	var major int
	var minor int
	if _, err := fmt.Sscanf(strings.TrimSpace(string(output)), "Python %d.%d", &major, &minor); err != nil {
		return false
	}
	return major > 3 || major == 3 && minor >= 11
}

func acceptsAnyVersion([]byte) bool {
	return true
}
