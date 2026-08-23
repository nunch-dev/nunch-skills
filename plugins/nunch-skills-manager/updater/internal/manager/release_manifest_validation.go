package manager

import (
	"errors"
	"path"
	"regexp"
	"strings"
)

var (
	ErrUnsupportedReleaseSchema = errors.New("unsupported release manifest schema")
	semverPattern               = regexp.MustCompile(
		`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$`,
	)
	hexSHA256Pattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
	hexCommitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

func validateReleaseManifest(manifest ReleaseManifest) error {
	if manifest.SchemaVersion != 1 {
		return manifestError("schemaVersion", "must be 1", ErrUnsupportedReleaseSchema)
	}
	if manifest.NPM.Name != "@nunch-dev/skills" {
		return manifestError("npm.name", "must be @nunch-dev/skills", nil)
	}
	if !validSemver(manifest.NPM.Version) {
		return manifestError("npm.version", "must be SemVer", nil)
	}
	if manifest.Git.Tag != "v"+manifest.NPM.Version {
		return manifestError("git.tag", "must match npm version", nil)
	}
	if !hexCommitPattern.MatchString(manifest.Git.Commit) {
		return manifestError("git.commit", "must be a full lowercase SHA-1", nil)
	}
	if !hexSHA256Pattern.MatchString(manifest.Git.ContentSHA256) {
		return manifestError("git.contentSha256", "must be a lowercase SHA-256", nil)
	}
	if err := validateReleasePlugins(manifest.Plugins); err != nil {
		return err
	}
	if err := validateReleaseFiles("npm.files", manifest.NPM.Files); err != nil {
		return err
	}
	for _, declared := range []struct {
		field string
		file  ReleaseFile
	}{
		{field: "marketplace", file: manifest.Marketplace},
		{field: "plugin", file: manifest.Plugin},
		{field: "hook", file: manifest.Hook},
	} {
		if err := validateReleaseFile(declared.field, declared.file); err != nil {
			return err
		}
	}
	if err := validateReleaseFiles("scripts", manifest.Scripts); err != nil {
		return err
	}
	if err := validateReleaseBinaries(manifest.Binaries); err != nil {
		return err
	}
	return validateReleasePathSets(manifest)
}

func validSemver(version string) bool {
	parts := semverPattern.FindStringSubmatch(version)
	if parts == nil {
		return false
	}
	if parts[4] != "" {
		for _, identifier := range strings.Split(strings.TrimPrefix(parts[4], "-"), ".") {
			if identifier == "" || numericWithLeadingZero(identifier) {
				return false
			}
		}
	}
	if parts[5] != "" {
		for _, identifier := range strings.Split(strings.TrimPrefix(parts[5], "+"), ".") {
			if identifier == "" {
				return false
			}
		}
	}
	return true
}

func numericWithLeadingZero(identifier string) bool {
	if len(identifier) < 2 || identifier[0] != '0' {
		return false
	}
	for _, character := range identifier {
		if character < '0' || character > '9' {
			return false
		}
	}
	return true
}

func validateReleaseFiles(field string, files []ReleaseFile) error {
	if len(files) == 0 {
		return manifestError(field, "must not be empty", nil)
	}
	seen := make(map[string]struct{}, len(files))
	for _, file := range files {
		if err := validateReleaseFile(field, file); err != nil {
			return err
		}
		if _, found := seen[file.Path]; found {
			return manifestError(field, "contains duplicate path", nil)
		}
		seen[file.Path] = struct{}{}
	}
	return nil
}

func validateReleaseFile(field string, file ReleaseFile) error {
	if !validReleasePath(file.Path) {
		return manifestError(field+".path", "must be a clean relative path", nil)
	}
	if !hexSHA256Pattern.MatchString(file.SHA256) {
		return manifestError(field+".sha256", "must be a lowercase SHA-256", nil)
	}
	return nil
}

func validateReleaseBinaries(binaries []ReleaseBinary) error {
	want := []string{"darwin-amd64", "darwin-arm64", "linux-amd64", "linux-arm64", "windows-amd64", "windows-arm64"}
	if len(binaries) != len(want) {
		return manifestError("binaries", "must contain six supported platforms", nil)
	}
	for index, binary := range binaries {
		if binary.Platform != want[index] {
			return manifestError("binaries.platform", "must contain every supported platform once", nil)
		}
		if !validReleasePath(binary.GitPath) || !validReleasePath(binary.NPMPath) {
			return manifestError("binaries.path", "must be a clean relative path", nil)
		}
		if !hexSHA256Pattern.MatchString(binary.SHA256) {
			return manifestError("binaries.sha256", "must be a lowercase SHA-256", nil)
		}
	}
	return nil
}

func validReleasePath(value string) bool {
	return value != "" && !strings.Contains(value, "\\") && path.Clean(value) == value &&
		value != "." && !strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "../")
}
