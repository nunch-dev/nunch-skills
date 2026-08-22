package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	versionPattern      = regexp.MustCompile(`^[0-9A-Za-z][0-9A-Za-z.+-]*$`)
	versionFieldPattern = regexp.MustCompile(`("version"\s*:\s*)"[^"]*"`)
)

type lockFile struct {
	Upstreams map[string]string `json:"upstreams"`
}

type manifestVersion struct {
	Version string `json:"version"`
}

type preparedUpstream struct {
	spec     upstreamSpec
	checkout string
	commit   string
}

func syncConfigured(ctx context.Context, root, configPath, lockPath string) error {
	parsed, err := loadConfig(configPath)
	if err != nil {
		return err
	}
	tempRoot, err := os.MkdirTemp("", "nunch-upstream-sync-")
	if err != nil {
		return fmt.Errorf("create temporary directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempRoot) }()

	prepared := make([]preparedUpstream, 0, len(parsed.upstreams))
	for _, upstream := range parsed.upstreams {
		checkout := filepath.Join(tempRoot, upstream.name)
		if err := cloneUpstream(ctx, upstream, checkout); err != nil {
			return err
		}
		commit, err := gitOutput(ctx, checkout, "rev-parse", "HEAD")
		if err != nil {
			return fmt.Errorf("resolve %s commit: %w", upstream.name, err)
		}
		if err := validateCheckout(checkout, upstream); err != nil {
			return fmt.Errorf("validate %s: %w", upstream.name, err)
		}
		prepared = append(prepared, preparedUpstream{spec: upstream, checkout: checkout, commit: commit})
	}

	commits := make(map[string]string, len(prepared))
	for _, upstream := range prepared {
		if err := applyUpstream(root, upstream.checkout, upstream.commit, upstream.spec); err != nil {
			return fmt.Errorf("apply %s: %w", upstream.spec.name, err)
		}
		commits[upstream.spec.name] = upstream.commit
	}
	return writeJSONAtomic(lockPath, lockFile{Upstreams: commits})
}

func validateCheckout(checkout string, upstream upstreamSpec) error {
	for _, item := range upstream.copies {
		if _, err := os.Lstat(filepath.Join(checkout, item.source.value)); err != nil {
			return fmt.Errorf("inspect source %s: %w", item.source.value, err)
		}
	}
	if upstream.version == nil {
		return nil
	}
	data, err := os.ReadFile(filepath.Join(checkout, upstream.version.source.value))
	if err != nil {
		return fmt.Errorf("read version source %s: %w", upstream.version.source.value, err)
	}
	var source manifestVersion
	if err := json.Unmarshal(data, &source); err != nil {
		return fmt.Errorf("decode version source %s: %w", upstream.version.source.value, err)
	}
	if !versionPattern.MatchString(source.Version) {
		return fmt.Errorf("version source %s has invalid version %q", upstream.version.source.value, source.Version)
	}
	return nil
}

func cloneUpstream(ctx context.Context, upstream upstreamSpec, checkout string) error {
	command := exec.CommandContext(ctx, "git", "clone", "--quiet", "--depth", "1",
		"--single-branch", "--branch", upstream.ref, upstream.repository, checkout)
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("clone %s at %s: %w: %s", upstream.name, upstream.ref, err, strings.TrimSpace(string(output)))
	}
	return nil
}

func gitOutput(ctx context.Context, directory string, args ...string) (string, error) {
	command := exec.CommandContext(ctx, "git", append([]string{"-C", directory}, args...)...)
	output, err := command.Output()
	if err != nil {
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(output)), nil
}

func applyUpstream(root, checkout, commit string, upstream upstreamSpec) error {
	for _, item := range upstream.copies {
		source := filepath.Join(checkout, item.source.value)
		destination := filepath.Join(root, item.destination.value)
		if _, err := os.Lstat(source); err != nil {
			return fmt.Errorf("inspect source %s: %w", item.source.value, err)
		}
		if err := replacePath(source, destination); err != nil {
			return fmt.Errorf("copy %s to %s: %w", item.source.value, item.destination.value, err)
		}
		if err := sanitizeSkillFrontmatter(destination, item.removeFrontmatter); err != nil {
			return fmt.Errorf("sanitize %s: %w", item.destination.value, err)
		}
	}
	if upstream.version != nil {
		if err := propagateVersion(root, checkout, commit, *upstream.version); err != nil {
			return err
		}
	}
	return nil
}

func propagateVersion(root, checkout, commit string, spec versionSpec) error {
	data, err := os.ReadFile(filepath.Join(checkout, spec.source.value))
	if err != nil {
		return fmt.Errorf("read version source %s: %w", spec.source.value, err)
	}
	var source manifestVersion
	if err := json.Unmarshal(data, &source); err != nil {
		return fmt.Errorf("decode version source %s: %w", spec.source.value, err)
	}
	if !versionPattern.MatchString(source.Version) {
		return fmt.Errorf("version source %s has invalid version %q", spec.source.value, source.Version)
	}
	version := source.Version
	if spec.appendCommit {
		version = buildVersion(version, commit)
	}
	for _, target := range spec.targets {
		if err := updateManifestVersion(filepath.Join(root, target.value), version); err != nil {
			return fmt.Errorf("update version target %s: %w", target.value, err)
		}
	}
	return nil
}

func buildVersion(version, commit string) string {
	base, _, _ := strings.Cut(version, "+")
	shortCommit := commit
	if len(shortCommit) > 12 {
		shortCommit = shortCommit[:12]
	}
	return base + "+upstream." + shortCommit
}

func updateManifestVersion(path, version string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read manifest: %w", err)
	}
	var current manifestVersion
	if err := json.Unmarshal(data, &current); err != nil {
		return fmt.Errorf("decode manifest: %w", err)
	}
	if matches := versionFieldPattern.FindAllIndex(data, -1); len(matches) != 1 {
		return fmt.Errorf("manifest must contain exactly one version field, found %d", len(matches))
	}
	updated := versionFieldPattern.ReplaceAll(data, []byte(`${1}"`+version+`"`))
	return writeFileAtomic(path, updated)
}
