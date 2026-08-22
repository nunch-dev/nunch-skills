package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

var (
	upstreamNamePattern     = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	frontmatterFieldPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9-]*$`)
)

type relativePath struct {
	value string
}

type copySpec struct {
	source            relativePath
	destination       relativePath
	removeFrontmatter []string
}

type versionSpec struct {
	source       relativePath
	targets      []relativePath
	appendCommit bool
}

type upstreamSpec struct {
	name       string
	repository string
	ref        string
	copies     []copySpec
	version    *versionSpec
}

type config struct {
	upstreams []upstreamSpec
}

type rawConfig struct {
	Upstreams []rawUpstream `json:"upstreams"`
}

type rawUpstream struct {
	Name       string      `json:"name"`
	Repository string      `json:"repository"`
	Ref        string      `json:"ref"`
	Copies     []rawCopy   `json:"copies"`
	Version    *rawVersion `json:"version"`
}

type rawCopy struct {
	Source            string   `json:"source"`
	Destination       string   `json:"destination"`
	RemoveFrontmatter []string `json:"removeFrontmatter"`
}

type rawVersion struct {
	Source       string   `json:"source"`
	Targets      []string `json:"targets"`
	AppendCommit bool     `json:"appendCommit"`
}

func loadConfig(path string) (config, error) {
	file, err := os.Open(path)
	if err != nil {
		return config{}, fmt.Errorf("open config %s: %w", path, err)
	}
	defer func() { _ = file.Close() }()

	var raw rawConfig
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&raw); err != nil {
		return config{}, fmt.Errorf("decode config %s: %w", path, err)
	}
	if err := ensureJSONEnd(decoder); err != nil {
		return config{}, fmt.Errorf("decode config %s: %w", path, err)
	}
	return parseConfig(raw)
}

func ensureJSONEnd(decoder *json.Decoder) error {
	var trailing json.RawMessage
	err := decoder.Decode(&trailing)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read trailing data: %w", err)
	}
	return errors.New("unexpected trailing JSON value")
}

func parseConfig(raw rawConfig) (config, error) {
	if len(raw.Upstreams) == 0 {
		return config{}, errors.New("config must contain at least one upstream")
	}

	names := make(map[string]struct{}, len(raw.Upstreams))
	upstreams := make([]upstreamSpec, 0, len(raw.Upstreams))
	for _, item := range raw.Upstreams {
		parsed, err := parseUpstream(item)
		if err != nil {
			return config{}, err
		}
		if _, exists := names[parsed.name]; exists {
			return config{}, fmt.Errorf("duplicate upstream name %q", parsed.name)
		}
		names[parsed.name] = struct{}{}
		upstreams = append(upstreams, parsed)
	}
	return config{upstreams: upstreams}, nil
}

func parseUpstream(raw rawUpstream) (upstreamSpec, error) {
	if !upstreamNamePattern.MatchString(raw.Name) {
		return upstreamSpec{}, fmt.Errorf("invalid upstream name %q", raw.Name)
	}
	if strings.TrimSpace(raw.Repository) == "" || strings.TrimSpace(raw.Ref) == "" {
		return upstreamSpec{}, fmt.Errorf("upstream %q requires repository and ref", raw.Name)
	}
	if len(raw.Copies) == 0 {
		return upstreamSpec{}, fmt.Errorf("upstream %q requires at least one copy", raw.Name)
	}

	copies := make([]copySpec, 0, len(raw.Copies))
	destinations := make([]relativePath, 0, len(raw.Copies))
	for _, item := range raw.Copies {
		source, err := newRelativePath("source", item.Source)
		if err != nil {
			return upstreamSpec{}, fmt.Errorf("upstream %q: %w", raw.Name, err)
		}
		destination, err := newRelativePath("destination", item.Destination)
		if err != nil {
			return upstreamSpec{}, fmt.Errorf("upstream %q: %w", raw.Name, err)
		}
		if overlapsAny(destination, destinations) {
			return upstreamSpec{}, fmt.Errorf("upstream %q has overlapping destination %q", raw.Name, destination.value)
		}
		destinations = append(destinations, destination)
		for _, field := range item.RemoveFrontmatter {
			if !frontmatterFieldPattern.MatchString(field) {
				return upstreamSpec{}, fmt.Errorf("upstream %q has invalid frontmatter field %q", raw.Name, field)
			}
		}
		copies = append(copies, copySpec{
			source: source, destination: destination, removeFrontmatter: item.RemoveFrontmatter,
		})
	}

	version, err := parseVersion(raw.Name, raw.Version)
	if err != nil {
		return upstreamSpec{}, err
	}
	return upstreamSpec{
		name: raw.Name, repository: raw.Repository, ref: raw.Ref,
		copies: copies, version: version,
	}, nil
}

func parseVersion(name string, raw *rawVersion) (*versionSpec, error) {
	if raw == nil {
		return nil, nil
	}
	source, err := newRelativePath("version source", raw.Source)
	if err != nil {
		return nil, fmt.Errorf("upstream %q: %w", name, err)
	}
	if len(raw.Targets) == 0 {
		return nil, fmt.Errorf("upstream %q requires at least one version target", name)
	}
	targets := make([]relativePath, 0, len(raw.Targets))
	for _, target := range raw.Targets {
		parsed, err := newRelativePath("version target", target)
		if err != nil {
			return nil, fmt.Errorf("upstream %q: %w", name, err)
		}
		targets = append(targets, parsed)
	}
	return &versionSpec{source: source, targets: targets, appendCommit: raw.AppendCommit}, nil
}

func newRelativePath(field, raw string) (relativePath, error) {
	cleaned := filepath.Clean(raw)
	if raw == "" || cleaned == "." || filepath.IsAbs(raw) || cleaned == ".." ||
		strings.HasPrefix(cleaned, ".."+string(filepath.Separator)) {
		return relativePath{}, fmt.Errorf("%s must stay inside its root: %q", field, raw)
	}
	return relativePath{value: cleaned}, nil
}

func overlapsAny(candidate relativePath, paths []relativePath) bool {
	for _, existing := range paths {
		if candidate.value == existing.value || pathContains(candidate.value, existing.value) ||
			pathContains(existing.value, candidate.value) {
			return true
		}
	}
	return false
}

func pathContains(parent, child string) bool {
	return strings.HasPrefix(child, parent+string(filepath.Separator))
}
