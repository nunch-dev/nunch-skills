package manager

import (
	"context"
	"strings"
	"testing"
)

func Test_VerifyRelease_acceptsMatchingNPMAndGitSources(t *testing.T) {
	// Given
	manifest, npm, git := matchingReleaseFixture(t)

	// When
	verified, err := VerifyRelease(context.Background(), manifest, npm, git)
	// Then
	if err != nil {
		t.Fatalf("VerifyRelease() error = %v", err)
	}
	if verified.Commit != manifest.Git.Commit || verified.Version != manifest.NPM.Version {
		t.Fatalf("VerifyRelease() = %#v", verified)
	}
}

func Test_VerifyRelease_rejectsEveryProtectedSourceMismatch(t *testing.T) {
	tests := []struct {
		name   string
		tamper func(*ReleaseManifest, *NPMRelease, *memoryGitContent)
	}{
		{name: "manifest bytes", tamper: func(_ *ReleaseManifest, npm *NPMRelease, _ *memoryGitContent) {
			npm.ManifestBytes = append([]byte(nil), npm.ManifestBytes...)
			npm.ManifestBytes[0] = ' '
		}},
		{name: "npm file", tamper: func(_ *ReleaseManifest, npm *NPMRelease, _ *memoryGitContent) {
			npm.Files["bin/launcher.js"] = []byte("tampered")
		}},
		{name: "unexpected npm file", tamper: func(_ *ReleaseManifest, npm *NPMRelease, _ *memoryGitContent) {
			npm.Files["postinstall.js"] = []byte("tampered")
		}},
		{name: "commit", tamper: func(_ *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.commit = strings.Repeat("b", 40)
		}},
		{name: "tag target", tamper: func(_ *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.tagTarget = strings.Repeat("b", 40)
		}},
		{name: "hook", tamper: func(_ *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.files["plugins/nunch-skills-manager/hooks/hooks.json"] = []byte("tampered")
		}},
		{name: "marketplace", tamper: func(manifest *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.files[manifest.Marketplace.Path] = []byte("tampered")
		}},
		{name: "plugin", tamper: func(manifest *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.files[manifest.Plugin.Path] = []byte("tampered")
		}},
		{name: "script", tamper: func(manifest *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.files[manifest.Scripts[0].Path] = []byte("tampered")
		}},
		{name: "git binary", tamper: func(manifest *ReleaseManifest, _ *NPMRelease, git *memoryGitContent) {
			git.files[manifest.Binaries[0].GitPath] = []byte("tampered")
		}},
		{name: "npm binary", tamper: func(manifest *ReleaseManifest, npm *NPMRelease, _ *memoryGitContent) {
			npm.Files[manifest.Binaries[0].NPMPath] = []byte("tampered")
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Given
			manifest, npm, git := matchingReleaseFixture(t)
			tt.tamper(&manifest, &npm, git)

			// When
			_, err := VerifyRelease(context.Background(), manifest, npm, git)

			// Then
			if err == nil {
				t.Fatal("VerifyRelease() error = nil")
			}
		})
	}
}

type memoryGitContent struct {
	commit    string
	tagTarget string
	files     map[string][]byte
}

func (source *memoryGitContent) Commit(context.Context) (string, error) {
	return source.commit, nil
}

func (source *memoryGitContent) ResolveTag(context.Context, string) (string, error) {
	return source.tagTarget, nil
}

func (source *memoryGitContent) ListFiles(context.Context) ([]string, error) {
	paths := make([]string, 0, len(source.files))
	for filePath := range source.files {
		paths = append(paths, filePath)
	}
	return paths, nil
}

func (source *memoryGitContent) ReadFile(_ context.Context, filePath string) ([]byte, error) {
	return source.files[filePath], nil
}

func matchingReleaseFixture(t *testing.T) (ReleaseManifest, NPMRelease, *memoryGitContent) {
	t.Helper()
	manifest := validReleaseManifest(t)
	gitFiles := map[string][]byte{
		manifest.Marketplace.Path: []byte("marketplace"),
		manifest.Plugin.Path:      []byte("plugin"),
		manifest.Hook.Path:        []byte("hook"),
		manifest.Scripts[0].Path:  []byte("script"),
		"README.md":               []byte("readme"),
	}
	for index := range manifest.Binaries {
		binary := &manifest.Binaries[index]
		gitFiles[binary.GitPath] = []byte(binary.Platform)
		binary.SHA256 = SHA256Bytes(gitFiles[binary.GitPath])
	}
	manifest.Marketplace.SHA256 = SHA256Bytes(gitFiles[manifest.Marketplace.Path])
	manifest.Plugin.SHA256 = SHA256Bytes(gitFiles[manifest.Plugin.Path])
	manifest.Hook.SHA256 = SHA256Bytes(gitFiles[manifest.Hook.Path])
	manifest.Scripts[0].SHA256 = SHA256Bytes(gitFiles[manifest.Scripts[0].Path])
	contentDigest, err := GitTreeSHA256(gitFiles)
	if err != nil {
		t.Fatalf("GitTreeSHA256() error = %v", err)
	}
	manifest.Git.ContentSHA256 = contentDigest
	npmFiles := map[string][]byte{ReleaseManifestPath: nil}
	for index := range manifest.NPM.Files {
		file := &manifest.NPM.Files[index]
		npmFiles[file.Path] = []byte(file.Path)
		file.SHA256 = SHA256Bytes(npmFiles[file.Path])
	}
	for _, binary := range manifest.Binaries {
		npmFiles[binary.NPMPath] = gitFiles[binary.GitPath]
	}
	manifestBytes := mustMarshalRelease(t, manifest)
	npmFiles[ReleaseManifestPath] = manifestBytes
	return manifest, NPMRelease{Manifest: manifest, ManifestBytes: manifestBytes, Files: npmFiles}, &memoryGitContent{
		commit: manifest.Git.Commit, tagTarget: manifest.Git.Commit, files: gitFiles,
	}
}
