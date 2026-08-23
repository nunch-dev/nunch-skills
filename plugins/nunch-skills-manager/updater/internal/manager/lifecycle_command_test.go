package manager

import (
	"errors"
	"testing"
)

func Test_ParseLifecycleCommand_returns_manager_only_install_by_default(t *testing.T) {
	// Given
	args := []string{"install"}

	// When
	command, err := ParseLifecycleCommand(args)
	// Then
	if err != nil {
		t.Fatalf("ParseLifecycleCommand() error = %v", err)
	}
	if command.Kind != LifecycleInstall || len(command.Plugins) != 0 || command.All {
		t.Fatalf("ParseLifecycleCommand() = %#v", command)
	}
}

func Test_ParseLifecycleCommand_accepts_explicit_plugins_and_flags(t *testing.T) {
	// Given
	args := []string{"install", "git-tools", "humanize-korean", "--dry-run", "--yes"}

	// When
	command, err := ParseLifecycleCommand(args)
	// Then
	if err != nil {
		t.Fatalf("ParseLifecycleCommand() error = %v", err)
	}
	if len(command.Plugins) != 2 || !command.DryRun || !command.Yes {
		t.Fatalf("ParseLifecycleCommand() = %#v", command)
	}
}

func Test_ParseLifecycleCommand_rejects_ambiguous_or_unknown_input(t *testing.T) {
	tests := []struct {
		name string
		args []string
	}{
		{name: "all and explicit", args: []string{"install", "--all", "git-tools"}},
		{name: "unknown flag", args: []string{"doctor", "--json"}},
		{name: "update positional", args: []string{"update", "git-tools"}},
		{name: "unknown command", args: []string{"repair"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			// When
			_, err := ParseLifecycleCommand(test.args)

			// Then
			if !errors.Is(err, ErrInvalidLifecycleCommand) {
				t.Fatalf("ParseLifecycleCommand() error = %v", err)
			}
		})
	}
}

func Test_ResolveInstallTargets_keeps_manager_first_and_rejects_unknown_plugins(t *testing.T) {
	// Given
	available := []string{"deep-interview", "git-tools", "nunch-skills-manager"}

	// When
	targets, err := ResolveInstallTargets(available, []string{"git-tools"}, false, "nunch-skills-manager")
	// Then
	if err != nil {
		t.Fatalf("ResolveInstallTargets() error = %v", err)
	}
	if len(targets) != 2 || targets[0] != "nunch-skills-manager" || targets[1] != "git-tools" {
		t.Fatalf("ResolveInstallTargets() = %#v", targets)
	}
	if _, err := ResolveInstallTargets(available, []string{"missing"}, false, "nunch-skills-manager"); err == nil {
		t.Fatal("ResolveInstallTargets() accepted unknown plugin")
	}
}

func Test_PlanCreatedUninstall_removes_manager_last_and_preserves_other_ownership(t *testing.T) {
	// Given
	state := LifecycleState{SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{
		{Kind: ResourcePlugin, Name: "nunch-skills-manager@nunch-skills", Ownership: OwnershipCreated},
		{Kind: ResourcePlugin, Name: "git-tools@nunch-skills", Ownership: OwnershipCreated},
		{
			Kind: ResourcePlugin, Name: "deep-interview@nunch-skills",
			Ownership: OwnershipPreExisting, PreStateFingerprint: "sha256:before",
		},
		{Kind: ResourceTrust, Name: ManagerHookTrustID, Ownership: OwnershipCreated},
		{Kind: ResourceMarketplace, Name: "nunch-skills", Ownership: OwnershipCreated},
	}}

	// When
	plan := PlanCreatedUninstall(state, "nunch-skills-manager@nunch-skills")

	// Then
	if len(plan.Plugins) != 2 || plan.Plugins[0] != "git-tools@nunch-skills" ||
		plan.Plugins[1] != "nunch-skills-manager@nunch-skills" {
		t.Fatalf("PlanCreatedUninstall() plugins = %#v", plan.Plugins)
	}
	if !plan.RemoveTrust || !plan.RemoveMarketplace {
		t.Fatalf("PlanCreatedUninstall() = %#v", plan)
	}
}
