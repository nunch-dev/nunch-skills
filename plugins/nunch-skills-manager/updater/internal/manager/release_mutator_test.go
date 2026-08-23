package manager

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func Test_ProductionAutoReleaseMutator_pinsUpdatesTrustsAndVerifiesExactRelease(t *testing.T) {
	// Given
	root := t.TempDir()
	pluginRoot := filepath.Join(root, "manager")
	manifest := installedManagerReleaseFixture(t, pluginRoot)
	hook, err := os.ReadFile(filepath.Join(pluginRoot, "hooks", "hooks.json"))
	if err != nil {
		t.Fatalf("ReadFile(hook) error = %v", err)
	}
	verifiedHook, err := VerifyManagerHook(pluginRoot, SHA256Bytes(hook), "darwin")
	if err != nil {
		t.Fatalf("VerifyManagerHook() error = %v", err)
	}
	configPath := filepath.Join(root, "config.toml")
	if err := os.WriteFile(configPath, []byte(fmt.Sprintf(
		"[hooks.state.%q]\ntrusted_hash = %q\n", ManagerHookTrustID, verifiedHook.TrustHash,
	)), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	previous := strings.Repeat("1", 40)
	target := strings.Repeat("a", 40)
	oldPlugins := pluginListJSON(pluginRoot, "1.0.0", "0.2.0")
	newPlugins := pluginListJSON(pluginRoot, "1.1.0", "0.2.1")
	runner := &fakeRunner{responses: []commandResponse{
		{output: marketplaceJSON("/market")},
		{output: []byte(previous)},
		{output: oldPlugins},
		{output: marketplaceJSON("/market")},
		{output: []byte(`{"removed":true}`)},
		{output: []byte(`{"added":true}`)},
		{output: installJSON("git-tools", "0.2.1")},
		{output: installJSON(defaultManagerPlugin, "1.1.0")},
		{output: newPlugins},
		{output: marketplaceJSON("/market")},
		{output: []byte(target)},
		{output: newPlugins},
		{output: newPlugins},
	}}
	manifest.NPM.Version = "1.1.0"
	manifest.Git.Commit = target
	manifest.Git.Tag = "v1.1.0"
	candidate := AutoReleaseCandidate{
		Release:  VerifiedRelease{Package: "@nunch-dev/skills", Version: "1.1.0", Commit: target},
		Manifest: manifest,
		Plugins: []AutoReleasePlugin{
			{ID: "git-tools@nunch-skills", Name: "git-tools", FromVersion: "0.2.0", Version: "0.2.1"},
			{
				ID: defaultManagerPlugin + "@nunch-skills", Name: defaultManagerPlugin,
				FromVersion: "1.0.0", Version: "1.1.0",
			},
		},
	}
	mutator := NewProductionAutoReleaseMutator(Config{
		CodexCommand: "codex", Marketplace: "nunch-skills", ManagerPlugin: defaultManagerPlugin,
	}, runner, configPath, filepath.Join(root, "snapshots"))

	// When
	err = mutator.Snapshot(context.Background(), "operation")
	if err == nil {
		err = mutator.PinMarketplace(context.Background(), candidate)
	}
	for _, plugin := range candidate.Plugins {
		if err == nil {
			err = mutator.UpdatePlugin(context.Background(), plugin)
		}
	}
	if err == nil {
		err = mutator.UpdateExactTrust(context.Background(), candidate)
	}
	if err == nil {
		err = mutator.VerifyFinal(context.Background(), candidate)
	}
	if err == nil {
		err = mutator.Commit("operation")
	}

	// Then
	if err != nil {
		t.Fatalf("release mutation error = %v", err)
	}
	if len(runner.responses) != 0 {
		t.Fatalf("unused runner responses = %d", len(runner.responses))
	}
	if _, statErr := os.Stat(filepath.Join(root, "snapshots", "operation.json")); !os.IsNotExist(statErr) {
		t.Fatalf("committed snapshot stat error = %v", statErr)
	}
}

func marketplaceJSON(root string) []byte {
	return []byte(fmt.Sprintf(`{"marketplaces":[{"name":"nunch-skills","root":%q}]}`, root))
}

func pluginListJSON(pluginRoot, managerVersion, gitVersion string) []byte {
	return []byte(fmt.Sprintf(`{"installed":[`+
		`{"pluginId":"git-tools@nunch-skills","name":"git-tools","marketplaceName":"nunch-skills",`+
		`"version":%q,"installed":true},`+
		`{"pluginId":"nunch-skills-manager@nunch-skills","name":"nunch-skills-manager",`+
		`"marketplaceName":"nunch-skills","version":%q,"installed":true,"source":{"path":%q}}]}`,
		gitVersion, managerVersion, pluginRoot))
}

func installJSON(name, version string) []byte {
	return []byte(fmt.Sprintf(`{"pluginId":%q,"name":%q,"version":%q}`, name+"@nunch-skills", name, version))
}
