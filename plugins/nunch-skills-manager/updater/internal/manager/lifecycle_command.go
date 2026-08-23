package manager

import (
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
)

var ErrInvalidLifecycleCommand = errors.New("invalid lifecycle command")

type LifecycleCommandKind string

const (
	LifecycleInstall   LifecycleCommandKind = "install"
	LifecycleUpdate    LifecycleCommandKind = "update"
	LifecycleUninstall LifecycleCommandKind = "uninstall"
	LifecycleDoctor    LifecycleCommandKind = "doctor"
)

type LifecycleCommand struct {
	Kind    LifecycleCommandKind
	Plugins []string
	All     bool
	DryRun  bool
	Yes     bool
}

type UninstallPlan struct {
	Plugins           []string
	RemoveTrust       bool
	TrustHash         string
	RemoveMarketplace bool
}

func ParseLifecycleCommand(args []string) (LifecycleCommand, error) {
	if len(args) == 0 {
		return LifecycleCommand{}, fmt.Errorf("command is required: %w", ErrInvalidLifecycleCommand)
	}
	kind := LifecycleCommandKind(args[0])
	if !validLifecycleCommandKind(kind) {
		return LifecycleCommand{}, fmt.Errorf("unknown command %q: %w", args[0], ErrInvalidLifecycleCommand)
	}
	command := LifecycleCommand{Kind: kind}
	for _, argument := range args[1:] {
		switch argument {
		case "--all":
			command.All = true
		case "--dry-run":
			command.DryRun = true
		case "--yes":
			command.Yes = true
		default:
			if strings.HasPrefix(argument, "-") || kind != LifecycleInstall {
				return LifecycleCommand{}, fmt.Errorf(
					"unsupported argument %q: %w",
					argument,
					ErrInvalidLifecycleCommand,
				)
			}
			command.Plugins = append(command.Plugins, argument)
		}
	}
	if command.All && (kind != LifecycleInstall || len(command.Plugins) != 0) {
		return LifecycleCommand{}, fmt.Errorf(
			"--all cannot be combined with plugin names: %w",
			ErrInvalidLifecycleCommand,
		)
	}
	return command, nil
}

func ResolveInstallTargets(available, requested []string, all bool, managerName string) ([]string, error) {
	known := make(map[string]struct{}, len(available))
	for _, name := range available {
		known[name] = struct{}{}
	}
	if _, found := known[managerName]; !found {
		return nil, fmt.Errorf("manager plugin %q is unavailable: %w", managerName, ErrInvalidLifecycleCommand)
	}
	selected := slices.Clone(requested)
	if all {
		selected = slices.Clone(available)
	}
	selected = append(selected, managerName)
	unique := make(map[string]struct{}, len(selected))
	for _, name := range selected {
		if _, found := known[name]; !found {
			return nil, fmt.Errorf("unknown plugin %q: %w", name, ErrInvalidLifecycleCommand)
		}
		unique[name] = struct{}{}
	}
	delete(unique, managerName)
	targets := make([]string, 0, len(unique)+1)
	targets = append(targets, managerName)
	others := make([]string, 0, len(unique))
	for name := range unique {
		others = append(others, name)
	}
	sort.Strings(others)
	return append(targets, others...), nil
}

func PlanCreatedUninstall(state LifecycleState, managerID string) UninstallPlan {
	plan := UninstallPlan{}
	for _, resource := range state.Resources {
		if resource.Ownership != OwnershipCreated {
			continue
		}
		switch resource.Kind {
		case ResourcePlugin:
			plan.Plugins = append(plan.Plugins, resource.Name)
		case ResourceTrust:
			if resource.Name == ManagerHookTrustID {
				plan.RemoveTrust = true
				plan.TrustHash = resource.PreStateFingerprint
			}
		case ResourceMarketplace:
			plan.RemoveMarketplace = true
		case ResourceData:
		}
	}
	sort.Slice(plan.Plugins, func(left, right int) bool {
		if plan.Plugins[left] == managerID {
			return false
		}
		if plan.Plugins[right] == managerID {
			return true
		}
		return plan.Plugins[left] < plan.Plugins[right]
	})
	return plan
}

func validLifecycleCommandKind(kind LifecycleCommandKind) bool {
	switch kind {
	case LifecycleInstall, LifecycleUpdate, LifecycleUninstall, LifecycleDoctor:
		return true
	default:
		return false
	}
}
