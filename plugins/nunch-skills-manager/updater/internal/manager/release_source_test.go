package manager

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func Test_ProductionReleaseSource_verifiesNPMAndGit_beforeReadingInstalledPlugins(t *testing.T) {
	// Given
	manifest, archive, repository := productionReleaseFixture(t)
	registry, err := NewNPMRegistryClient(
		"https://registry.example",
		npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive)),
	)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	codex := &fakeRunner{responses: []commandResponse{{output: []byte(
		`{"installed":[{"pluginId":"git-tools@nunch-skills","name":"git-tools",` +
			`"marketplaceName":"nunch-skills","version":"0.2.0","installed":true},{` +
			`"pluginId":"nunch-skills-manager@nunch-skills","name":"nunch-skills-manager",` +
			`"marketplaceName":"nunch-skills","version":"1.0.0","installed":true}]}`,
	)}}}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: ExecRunner{}, Codex: Config{
			CodexCommand: "codex", Marketplace: "nunch-skills", ManagerPlugin: defaultManagerPlugin,
		}, CodexRun: codex, GitRemote: repository, TempParent: t.TempDir(),
	})

	// When
	candidate, found, err := source.DiscoverAndVerify(context.Background(), nil)
	// Then
	if err != nil {
		t.Fatalf("DiscoverAndVerify() error = %v", err)
	}
	if !found || candidate.Release.Commit != manifest.Git.Commit || len(candidate.Plugins) != 2 {
		t.Fatalf("DiscoverAndVerify() = %#v, %t", candidate, found)
	}
	if candidate.Plugins[0].Version != "0.2.1" || len(codex.calls) != 1 {
		t.Fatalf("candidate plugins = %#v, codex calls = %#v", candidate.Plugins, codex.calls)
	}
}

func Test_ProductionReleaseSource_doesNotReadInstalledPlugins_whenGitIdentityDiffers(t *testing.T) {
	// Given
	manifest, archive, repository := productionReleaseFixture(t)
	if err := os.WriteFile(filepath.Join(repository, "README.md"), []byte("tampered"), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	runGitFixture(t, repository, "add", "README.md")
	runGitFixture(t, repository, "commit", "--quiet", "--amend", "--no-edit")
	runGitFixture(t, repository, "tag", "--force", manifest.Git.Tag)
	registry, err := NewNPMRegistryClient(
		"https://registry.example",
		npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive)),
	)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	codex := &fakeRunner{}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: ExecRunner{}, Codex: Config{
			CodexCommand: "codex", Marketplace: "nunch-skills", ManagerPlugin: defaultManagerPlugin,
		}, CodexRun: codex, GitRemote: repository, TempParent: t.TempDir(),
	})

	// When
	_, _, err = source.DiscoverAndVerify(context.Background(), nil)

	// Then
	if err == nil || len(codex.calls) != 0 {
		t.Fatalf("DiscoverAndVerify() error = %v, codex calls = %#v", err, codex.calls)
	}
}

func Test_ProductionReleaseSource_verifiesPackagedManifest_withoutCodexMutation(t *testing.T) {
	// Given
	manifest, archive, repository := productionReleaseFixture(t)
	registry, err := NewNPMRegistryClient(
		"https://registry.example",
		npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive)),
	)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	codex := &fakeRunner{}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: ExecRunner{}, CodexRun: codex,
		GitRemote: repository, TempParent: t.TempDir(),
	})

	// When
	verified, err := source.VerifyPackaged(context.Background(), manifest)
	// Then
	if err != nil {
		t.Fatalf("VerifyPackaged() error = %v", err)
	}
	if verified.Commit != manifest.Git.Commit || len(codex.calls) != 0 {
		t.Fatalf("verified = %#v, codex calls = %#v", verified, codex.calls)
	}
}

func Test_ProductionReleaseSource_rejectsPackagedManifestDrift_withoutCodexMutation(t *testing.T) {
	// Given
	manifest, archive, repository := productionReleaseFixture(t)
	registry, err := NewNPMRegistryClient(
		"https://registry.example",
		npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive)),
	)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	codex := &fakeRunner{}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: ExecRunner{}, CodexRun: codex,
		GitRemote: repository, TempParent: t.TempDir(),
	})
	manifest.Hook.SHA256 = strings.Repeat("f", 64)

	// When
	_, err = source.VerifyPackaged(context.Background(), manifest)

	// Then
	if err == nil || len(codex.calls) != 0 {
		t.Fatalf("VerifyPackaged() error = %v, codex calls = %#v", err, codex.calls)
	}
}

func Test_ProductionReleaseSource_ignoresDowngrade_beforeGitOrCodex(t *testing.T) {
	// Given
	manifest, archive, repository := productionReleaseFixture(t)
	registry, err := NewNPMRegistryClient(
		"https://registry.example",
		npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive)),
	)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	codex := &fakeRunner{}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: &fakeRunner{}, CodexRun: codex,
		GitRemote: repository, TempParent: t.TempDir(),
	})
	current := ReleaseState{Version: "2.0.0", Commit: strings.Repeat("2", 40)}

	// When
	_, found, err := source.DiscoverAndVerify(context.Background(), &current)

	// Then
	if err != nil || found || len(codex.calls) != 0 {
		t.Fatalf("DiscoverAndVerify() found = %t, error = %v, codex calls = %#v", found, err, codex.calls)
	}
}

func productionReleaseFixture(t *testing.T) (ReleaseManifest, []byte, string) {
	t.Helper()
	repository := filepath.Join(t.TempDir(), "release.git")
	if err := os.MkdirAll(repository, 0o700); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	gitFiles := map[string][]byte{
		".agents/plugins/marketplace.json": []byte(`{"name":"nunch-skills","plugins":[` +
			`{"name":"git-tools","source":{"source":"local","path":"./plugins/git-tools"}},` +
			`{"name":"nunch-skills-manager","source":{"source":"local","path":"./plugins/nunch-skills-manager"}}]}`),
		"plugins/git-tools/.codex-plugin/plugin.json": []byte(`{"name":"git-tools","version":"0.2.1"}`),
		"plugins/nunch-skills-manager/.codex-plugin/plugin.json": []byte(
			`{"name":"nunch-skills-manager","version":"1.1.0"}`,
		),
		"plugins/nunch-skills-manager/hooks/hooks.json":       []byte("hook"),
		"plugins/nunch-skills-manager/scripts/run-manager.sh": []byte("script"),
		"README.md": []byte("release"),
	}
	manifest := validReleaseManifest(t)
	manifest.NPM.Version = "1.1.0"
	manifest.Git.Tag = "v1.1.0"
	manifest.Marketplace.Path = ".agents/plugins/marketplace.json"
	manifest.Plugin.Path = "plugins/nunch-skills-manager/.codex-plugin/plugin.json"
	manifest.Hook.Path = "plugins/nunch-skills-manager/hooks/hooks.json"
	manifest.Scripts = []ReleaseFile{{Path: "plugins/nunch-skills-manager/scripts/run-manager.sh"}}
	manifest.Plugins = []ReleasePlugin{
		{Name: "git-tools", Version: "0.2.1"},
		{Name: "nunch-skills-manager", Version: "1.1.0"},
	}
	for index := range manifest.Binaries {
		data := []byte(manifest.Binaries[index].Platform)
		gitFiles[manifest.Binaries[index].GitPath] = data
		manifest.Binaries[index].SHA256 = SHA256Bytes(data)
	}
	for filePath, data := range gitFiles {
		location := filepath.Join(repository, filepath.FromSlash(filePath))
		if err := os.MkdirAll(filepath.Dir(location), 0o700); err != nil {
			t.Fatalf("MkdirAll(%s) error = %v", filePath, err)
		}
		if err := os.WriteFile(location, data, 0o600); err != nil {
			t.Fatalf("WriteFile(%s) error = %v", filePath, err)
		}
	}
	runGitFixture(t, repository, "init", "--quiet")
	runGitFixture(t, repository, "config", "user.name", "Release Test")
	runGitFixture(t, repository, "config", "user.email", "release@example.test")
	runGitFixture(t, repository, "add", ".")
	runGitFixture(t, repository, "commit", "--quiet", "-m", "release")
	manifest.Git.Commit = strings.TrimSpace(runGitFixture(t, repository, "rev-parse", "HEAD"))
	runGitFixture(t, repository, "tag", manifest.Git.Tag)
	contentDigest, err := GitTreeSHA256(gitFiles)
	if err != nil {
		t.Fatalf("GitTreeSHA256() error = %v", err)
	}
	manifest.Git.ContentSHA256 = contentDigest
	manifest.Marketplace.SHA256 = SHA256Bytes(gitFiles[manifest.Marketplace.Path])
	manifest.Plugin.SHA256 = SHA256Bytes(gitFiles[manifest.Plugin.Path])
	manifest.Hook.SHA256 = SHA256Bytes(gitFiles[manifest.Hook.Path])
	manifest.Scripts[0].SHA256 = SHA256Bytes(gitFiles[manifest.Scripts[0].Path])
	npmFiles := map[string][]byte{}
	for index := range manifest.NPM.Files {
		data := []byte(manifest.NPM.Files[index].Path)
		manifest.NPM.Files[index].SHA256 = SHA256Bytes(data)
		npmFiles[manifest.NPM.Files[index].Path] = data
	}
	for _, binary := range manifest.Binaries {
		npmFiles[binary.NPMPath] = gitFiles[binary.GitPath]
	}
	npmFiles[ReleaseManifestPath] = mustMarshalRelease(t, manifest)
	return manifest, npmArchive(t, npmFiles), repository
}

func runGitFixture(t *testing.T, repository string, args ...string) string {
	t.Helper()
	output, err := (ExecRunner{}).Run(context.Background(), "git", append([]string{"-C", repository}, args...)...)
	if err != nil {
		t.Fatalf("git %v error = %v", args, err)
	}
	return string(output)
}
