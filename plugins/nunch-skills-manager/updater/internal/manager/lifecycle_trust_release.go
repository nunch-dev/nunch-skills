package manager

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

var ErrManagerPayloadMismatch = errors.New("installed manager payload does not match verified release")

const managerPluginPath = "plugins/nunch-skills-manager"

func VerifyInstalledManagerRelease(
	pluginRoot string,
	manifest ReleaseManifest,
	operatingSystem string,
	architecture string,
) (VerifiedManagerHook, error) {
	if manifest.Plugin.Path != managerPluginPath+"/.codex-plugin/plugin.json" {
		return VerifiedManagerHook{}, ErrManagerPayloadMismatch
	}
	if err := verifyInstalledReleaseFile(
		pluginRoot, ".codex-plugin/plugin.json", manifest.Plugin.SHA256,
	); err != nil {
		return VerifiedManagerHook{}, err
	}
	if manifest.Hook.Path != managerPluginPath+"/hooks/hooks.json" {
		return VerifiedManagerHook{}, ErrManagerPayloadMismatch
	}
	hook, err := VerifyManagerHook(pluginRoot, manifest.Hook.SHA256, operatingSystem)
	if err != nil {
		return VerifiedManagerHook{}, errors.Join(ErrManagerPayloadMismatch, err)
	}
	if err := verifyInstalledManagerScripts(pluginRoot, manifest.Scripts); err != nil {
		return VerifiedManagerHook{}, err
	}
	if err := verifyInstalledManagerBinary(pluginRoot, manifest.Binaries, operatingSystem, architecture); err != nil {
		return VerifiedManagerHook{}, err
	}
	return hook, nil
}

func verifyInstalledManagerScripts(pluginRoot string, scripts []ReleaseFile) error {
	want := map[string]string{
		managerPluginPath + "/scripts/run-manager.ps1": "scripts/run-manager.ps1",
		managerPluginPath + "/scripts/run-manager.sh":  "scripts/run-manager.sh",
	}
	if len(scripts) != len(want) {
		return ErrManagerPayloadMismatch
	}
	for _, script := range scripts {
		relative, found := want[script.Path]
		if !found {
			return ErrManagerPayloadMismatch
		}
		if err := verifyInstalledReleaseFile(pluginRoot, relative, script.SHA256); err != nil {
			return err
		}
		delete(want, script.Path)
	}
	if len(want) != 0 {
		return ErrManagerPayloadMismatch
	}
	return nil
}

func verifyInstalledManagerBinary(
	pluginRoot string,
	binaries []ReleaseBinary,
	operatingSystem string,
	architecture string,
) error {
	platform := operatingSystem + "-" + architecture
	name := installedManagerBinaryName(operatingSystem, architecture)
	if name == "" {
		return ErrManagerPayloadMismatch
	}
	wantPath := managerPluginPath + "/bin/" + name
	found := false
	for _, binary := range binaries {
		if binary.Platform != platform {
			continue
		}
		if found || binary.GitPath != wantPath {
			return ErrManagerPayloadMismatch
		}
		found = true
		if err := verifyInstalledReleaseFile(pluginRoot, "bin/"+name, binary.SHA256); err != nil {
			return err
		}
	}
	if !found {
		return ErrManagerPayloadMismatch
	}
	return nil
}

func verifyInstalledReleaseFile(root string, relative string, expectedDigest string) error {
	location := filepath.Join(root, filepath.FromSlash(relative))
	info, err := os.Lstat(location)
	if err != nil {
		return fmt.Errorf("inspect installed manager %s: %w", relative, errors.Join(ErrManagerPayloadMismatch, err))
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("installed manager %s is not a regular file: %w", relative, ErrManagerPayloadMismatch)
	}
	data, err := os.ReadFile(location)
	if err != nil {
		return fmt.Errorf("read installed manager %s: %w", relative, errors.Join(ErrManagerPayloadMismatch, err))
	}
	if SHA256Bytes(data) != expectedDigest {
		return fmt.Errorf("installed manager %s digest differs: %w", relative, ErrManagerPayloadMismatch)
	}
	return nil
}

func installedManagerBinaryName(operatingSystem string, architecture string) string {
	return installedManagerBinaryNameFromPlatform(operatingSystem + "-" + architecture)
}

func installedManagerBinaryNameFromPlatform(platform string) string {
	parts := strings.Split(platform, "-")
	if len(parts) != 2 || (parts[0] != "darwin" && parts[0] != "linux" && parts[0] != "windows") ||
		(parts[1] != "amd64" && parts[1] != "arm64") {
		return ""
	}
	name := "nunch-skills-manager-" + platform
	if parts[0] == "windows" {
		name += ".exe"
	}
	return name
}
