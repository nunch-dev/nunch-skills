package manager

import (
	"errors"
	"strings"
	"testing"
)

func Test_ParseReleaseManifest_acceptsCanonicalManifest(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	data, err := MarshalReleaseManifest(manifest)
	if err != nil {
		t.Fatalf("MarshalReleaseManifest() error = %v", err)
	}

	// When
	got, err := ParseReleaseManifest(data)
	// Then
	if err != nil {
		t.Fatalf("ParseReleaseManifest() error = %v", err)
	}
	if got.NPM.Name != "@nunch-dev/skills" || got.Git.Tag != "v1.2.3" {
		t.Fatalf("ParseReleaseManifest() = %#v", got)
	}
	if len(got.Plugins) != 2 || got.Plugins[0].Name != "git-tools" {
		t.Fatalf("ParseReleaseManifest() plugins = %#v", got.Plugins)
	}
}

func Test_ParseReleaseManifest_rejectsInvalidBoundaryInput(t *testing.T) {
	// Given
	canonical, err := MarshalReleaseManifest(validReleaseManifest(t))
	if err != nil {
		t.Fatalf("MarshalReleaseManifest() error = %v", err)
	}
	tests := []struct {
		name string
		data string
		err  error
	}{
		{
			name: "unsupported schema",
			data: strings.Replace(string(canonical), `"schemaVersion":1`, `"schemaVersion":2`, 1),
			err:  ErrUnsupportedReleaseSchema,
		},
		{
			name: "duplicate field",
			data: strings.Replace(
				string(canonical), `"schemaVersion":1`, `"schemaVersion":1,"schemaVersion":1`, 1,
			),
		},
		{
			name: "unknown field",
			data: strings.Replace(string(canonical), `"schemaVersion":1`, `"schemaVersion":1,"extra":true`, 1),
		},
		{name: "non canonical whitespace", data: " " + string(canonical)},
		{
			name: "path traversal",
			data: strings.Replace(
				string(canonical), `"path":"bin/launcher.js"`, `"path":"../launcher.js"`, 1,
			),
		},
		{
			name: "invalid semver prerelease",
			data: strings.Replace(
				strings.Replace(string(canonical), `"version":"1.2.3"`, `"version":"1.2.3-01"`, 1),
				`"tag":"v1.2.3"`,
				`"tag":"v1.2.3-01"`,
				1,
			),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// When
			_, parseErr := ParseReleaseManifest([]byte(tt.data))

			// Then
			if parseErr == nil {
				t.Fatal("ParseReleaseManifest() error = nil")
			}
			if tt.err != nil && !errors.Is(parseErr, tt.err) {
				t.Fatalf("ParseReleaseManifest() error = %v, want errors.Is(%v)", parseErr, tt.err)
			}
		})
	}
}

func Test_MarshalReleaseManifest_requiresEveryPlatformOnce(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	manifest.Binaries = append(manifest.Binaries[:5], manifest.Binaries[0])

	// When
	_, err := MarshalReleaseManifest(manifest)

	// Then
	if err == nil {
		t.Fatal("MarshalReleaseManifest() error = nil")
	}
}

func Test_MarshalReleaseManifest_rejectsOverlappingNPMPaths(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	manifest.NPM.Files[0].Path = manifest.Binaries[0].NPMPath

	// When
	_, err := MarshalReleaseManifest(manifest)

	// Then
	if err == nil {
		t.Fatal("MarshalReleaseManifest() error = nil")
	}
}

func validReleaseManifest(t *testing.T) ReleaseManifest {
	t.Helper()
	digest := SHA256Bytes([]byte("fixture"))
	commit := strings.Repeat("a", 40)
	platforms := []string{
		"darwin-amd64", "darwin-arm64", "linux-amd64",
		"linux-arm64", "windows-amd64", "windows-arm64",
	}
	binaries := make([]ReleaseBinary, 0, len(platforms))
	for _, platform := range platforms {
		binaries = append(binaries, ReleaseBinary{
			Platform: platform,
			GitPath:  "plugins/nunch-skills-manager/bin/manager-" + platform,
			NPMPath:  "vendor/manager-" + platform,
			SHA256:   digest,
		})
	}
	return ReleaseManifest{
		SchemaVersion: 1,
		NPM: ReleaseNPM{
			Name:    "@nunch-dev/skills",
			Version: "1.2.3",
			Files: []ReleaseFile{
				{Path: "bin/launcher.js", SHA256: digest},
				{Path: "package.json", SHA256: digest},
			},
		},
		Git: ReleaseGit{Tag: "v1.2.3", Commit: commit, ContentSHA256: digest},
		Plugins: []ReleasePlugin{
			{Name: "git-tools", Version: "0.2.1"},
			{Name: "nunch-skills-manager", Version: "1.2.3"},
		},
		Marketplace: ReleaseFile{Path: ".claude-plugin/marketplace.json", SHA256: digest},
		Plugin:      ReleaseFile{Path: "plugins/nunch-skills-manager/.codex-plugin/plugin.json", SHA256: digest},
		Hook:        ReleaseFile{Path: "plugins/nunch-skills-manager/hooks/hooks.json", SHA256: digest},
		Scripts:     []ReleaseFile{{Path: "plugins/nunch-skills-manager/scripts/run-manager.sh", SHA256: digest}},
		Binaries:    binaries,
	}
}
