package manager

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
)

const dependencyManifestName = "dependencies.json"

type dependencyManifest struct {
	SchemaVersion int                    `json:"schemaVersion"`
	Executables   []executableDependency `json:"executables"`
	Manual        []manualDeclaration    `json:"manual"`
}

type executableDependency struct {
	Name           string   `json:"name"`
	Requirement    string   `json:"requirement"`
	Candidates     []string `json:"candidates"`
	VersionArgs    []string `json:"versionArgs"`
	VersionPrefix  string   `json:"versionPrefix"`
	MinimumVersion string   `json:"minimumVersion"`
}

type manualDeclaration struct {
	Name string `json:"name"`
}

type dependencySpec struct {
	declaration executableDependency
	minimum     toolVersion
	requiredBy  []string
}

type toolVersion struct {
	major int
	minor int
	patch int
}

type DependencyManifestError struct {
	Plugin string
	Reason string
}

func (err *DependencyManifestError) Error() string {
	return fmt.Sprintf("plugin %s dependencies: %s", err.Plugin, err.Reason)
}

func loadDependencyDeclarations(plugins PluginList) ([]dependencySpec, []ManualDependency, error) {
	executables := make(map[string]dependencySpec)
	manual := make(map[string][]string)
	for _, plugin := range plugins.Installed {
		if !plugin.Installed || plugin.Source.Path == "" {
			continue
		}
		manifest, err := readDependencyManifest(plugin)
		if err != nil {
			return nil, nil, err
		}
		for _, declaration := range manifest.Executables {
			spec, err := newDependencySpec(plugin.Name, declaration)
			if err != nil {
				return nil, nil, err
			}
			existing, found := executables[declaration.Name]
			if found && !sameDependency(existing.declaration, declaration) {
				return nil, nil, &DependencyManifestError{
					Plugin: plugin.Name,
					Reason: "conflicting declaration for " + declaration.Name,
				}
			}
			if found {
				existing.requiredBy = append(existing.requiredBy, plugin.Name)
				executables[declaration.Name] = existing
			} else {
				executables[declaration.Name] = spec
			}
		}
		for _, declaration := range manifest.Manual {
			if declaration.Name == "" {
				return nil, nil, &DependencyManifestError{
					Plugin: plugin.Name,
					Reason: "manual dependency name is required",
				}
			}
			manual[declaration.Name] = append(manual[declaration.Name], plugin.Name)
		}
	}
	return sortedDependencySpecs(executables), sortedManualDependencies(manual), nil
}

func readDependencyManifest(plugin Plugin) (dependencyManifest, error) {
	path := filepath.Join(plugin.Source.Path, dependencyManifestName)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return dependencyManifest{SchemaVersion: 1}, nil
	}
	if err != nil {
		return dependencyManifest{}, &DependencyManifestError{Plugin: plugin.Name, Reason: err.Error()}
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest dependencyManifest
	if err := decoder.Decode(&manifest); err != nil {
		return dependencyManifest{}, &DependencyManifestError{Plugin: plugin.Name, Reason: "decode: " + err.Error()}
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return dependencyManifest{}, &DependencyManifestError{
			Plugin: plugin.Name,
			Reason: "must contain one JSON object",
		}
	}
	if manifest.SchemaVersion != 1 {
		return dependencyManifest{}, &DependencyManifestError{Plugin: plugin.Name, Reason: "schemaVersion must be 1"}
	}
	return manifest, nil
}

func newDependencySpec(plugin string, declaration executableDependency) (dependencySpec, error) {
	if declaration.Name == "" || declaration.Requirement == "" ||
		len(declaration.Candidates) == 0 || len(declaration.VersionArgs) == 0 {
		return dependencySpec{}, &DependencyManifestError{Plugin: plugin, Reason: "executable fields are incomplete"}
	}
	for _, candidate := range declaration.Candidates {
		if candidate == "" || filepath.Base(candidate) != candidate {
			return dependencySpec{}, &DependencyManifestError{
				Plugin: plugin,
				Reason: "candidate must be an executable name",
			}
		}
	}
	minimum, err := parseToolVersion(declaration.MinimumVersion)
	if err != nil {
		return dependencySpec{}, &DependencyManifestError{Plugin: plugin, Reason: "minimumVersion: " + err.Error()}
	}
	return dependencySpec{declaration: declaration, minimum: minimum, requiredBy: []string{plugin}}, nil
}

func versionMeetsMinimum(output []byte, prefix string, minimum toolVersion) bool {
	if minimum == (toolVersion{}) {
		return len(strings.TrimSpace(string(output))) > 0
	}
	raw := strings.TrimSpace(string(output))
	if prefix != "" && !strings.HasPrefix(raw, prefix) {
		return false
	}
	fields := strings.Fields(strings.TrimPrefix(raw, prefix))
	if len(fields) == 0 {
		return false
	}
	version, err := parseToolVersion(fields[0])
	if err != nil {
		return false
	}
	return version.major > minimum.major ||
		version.major == minimum.major && version.minor > minimum.minor ||
		version.major == minimum.major && version.minor == minimum.minor && version.patch >= minimum.patch
}

func parseToolVersion(raw string) (toolVersion, error) {
	if raw == "" {
		return toolVersion{}, nil
	}
	parts := strings.Split(raw, ".")
	if len(parts) < 2 || len(parts) > 3 {
		return toolVersion{}, errors.New("expected major.minor[.patch]")
	}
	values := [3]int{}
	for index, part := range parts {
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 {
			return toolVersion{}, errors.New("contains a non-numeric part")
		}
		values[index] = value
	}
	return toolVersion{major: values[0], minor: values[1], patch: values[2]}, nil
}

func sameDependency(left executableDependency, right executableDependency) bool {
	return left.Name == right.Name && left.Requirement == right.Requirement &&
		slices.Equal(left.Candidates, right.Candidates) && slices.Equal(left.VersionArgs, right.VersionArgs) &&
		left.VersionPrefix == right.VersionPrefix && left.MinimumVersion == right.MinimumVersion
}

func sortedDependencySpecs(specs map[string]dependencySpec) []dependencySpec {
	names := make([]string, 0, len(specs))
	for name := range specs {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]dependencySpec, 0, len(names))
	for _, name := range names {
		spec := specs[name]
		sort.Strings(spec.requiredBy)
		result = append(result, spec)
	}
	return result
}

func sortedManualDependencies(dependencies map[string][]string) []ManualDependency {
	names := make([]string, 0, len(dependencies))
	for name := range dependencies {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]ManualDependency, 0, len(names))
	for _, name := range names {
		requiredBy := dependencies[name]
		sort.Strings(requiredBy)
		result = append(result, ManualDependency{Name: name, RequiredBy: requiredBy})
	}
	return result
}
