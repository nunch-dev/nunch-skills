package manager

import (
	"fmt"
	"os"
	"path/filepath"
)

var cliVersion = "dev"

func CLIVersion() string { return cliVersion }

func LoadPackagedReleaseManifest(
	getenv func(string) string,
	executable func() (string, error),
) (*ReleaseManifest, error) {
	manifestPath := getenv("NUNCH_SKILLS_RELEASE_MANIFEST")
	if manifestPath == "" {
		binaryPath, err := executable()
		if err != nil {
			return nil, fmt.Errorf("resolve lifecycle executable: %w", err)
		}
		manifestPath = filepath.Clean(filepath.Join(filepath.Dir(binaryPath), "..", "..", "..", ReleaseManifestPath))
	}
	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		return nil, fmt.Errorf("read packaged release manifest: %w", err)
	}
	manifest, err := ParseReleaseManifest(raw)
	if err != nil {
		return nil, err
	}
	return &manifest, nil
}
