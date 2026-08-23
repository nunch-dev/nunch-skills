package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager"
)

func runDoctor(config manager.RuntimeConfig, home string, stdout, stderr io.Writer) int {
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	manifest, manifestErr := manager.LoadPackagedReleaseManifest(os.Getenv, os.Executable)
	executablePath, executableErr := os.Executable()
	manifestErr = errors.Join(manifestErr, executableErr)
	paths := manager.NewLifecyclePaths(resolveCodexHome(home))
	report := manager.DiagnoseLifecycle(ctx, manager.LifecycleDoctorConfig{
		Manager: config.Manager, Runner: manager.ExecRunner{}, Store: manager.NewLifecycleStore(paths.State),
		Manifest: manifest, ManifestErr: manifestErr,
		ConfigPath: filepath.Join(resolveCodexHome(home), "config.toml"), ExecutablePath: executablePath,
	})
	if err := json.NewEncoder(stdout).Encode(report); err != nil {
		return writeError(stderr, err)
	}
	return report.ExitCode()
}

func runLifecycle(
	config manager.RuntimeConfig,
	home string,
	command manager.LifecycleCommand,
	stdout, stderr io.Writer,
) int {
	manifest, err := manager.LoadPackagedReleaseManifest(os.Getenv, os.Executable)
	if err != nil {
		return writeError(stderr, err)
	}
	codexHome := resolveCodexHome(home)
	if command.Kind == manager.LifecycleUpdate {
		return runForegroundUpdate(config, codexHome, command, stdout, stderr)
	}
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	if err := verifyPackagedInstall(ctx, config, codexHome, command.Kind, *manifest); err != nil {
		return writeError(stderr, err)
	}
	paths := manager.NewLifecyclePaths(codexHome)
	backend := manager.NewCodexLifecycleBackend(
		config.Manager, manager.ExecRunner{}, filepath.Join(codexHome, "config.toml"),
	)
	service := manager.NewLifecycleService(manager.LifecycleServiceConfig{
		Backend: backend, Store: manager.NewLifecycleStore(paths.State), LockPath: paths.Lock,
		LockStaleAfter: config.LockStaleAfter, Clock: manager.SystemClock{}, Manifest: *manifest,
		ManagerName: config.Manager.ManagerPlugin, Marketplace: config.Manager.Marketplace,
	})
	preview := command
	preview.DryRun = true
	result, err := service.Execute(ctx, preview)
	if err != nil {
		return writeError(stderr, err)
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return writeError(stderr, err)
	}
	if command.DryRun {
		return 0
	}
	if command.Kind == manager.LifecycleUninstall && !command.Yes {
		confirmed, confirmErr := confirmUninstall(os.Stdin, stdout)
		if confirmErr != nil {
			return writeError(stderr, confirmErr)
		}
		if !confirmed {
			return writeLine(stderr, "uninstall cancelled", 2)
		}
		command.Yes = true
	}
	result, err = service.Execute(ctx, command)
	if errors.Is(err, manager.ErrConfirmationRequired) {
		return writeLine(stderr, "uninstall requires confirmation", 2)
	}
	if err != nil {
		return writeError(stderr, err)
	}
	if err := json.NewEncoder(stdout).Encode(result); err != nil {
		return writeError(stderr, err)
	}
	return 0
}

func verifyPackagedInstall(
	ctx context.Context,
	config manager.RuntimeConfig,
	codexHome string,
	kind manager.LifecycleCommandKind,
	manifest manager.ReleaseManifest,
) error {
	if kind != manager.LifecycleInstall {
		return nil
	}
	autoRelease, err := manager.NewProductionAutoRelease(config, codexHome, os.Getenv)
	if err != nil {
		return err
	}
	if _, err := autoRelease.Source.VerifyPackaged(ctx, manifest); err != nil {
		return fmt.Errorf("verify packaged install release: %w", err)
	}
	return nil
}

func confirmUninstall(input *os.File, output io.Writer) (bool, error) {
	info, err := input.Stat()
	if err != nil {
		return false, fmt.Errorf("inspect input terminal: %w", err)
	}
	if info.Mode()&os.ModeCharDevice == 0 {
		return false, errors.New("uninstall requires an interactive terminal or --yes")
	}
	if _, err := fmt.Fprint(output, "Remove the previewed resources? [y/N] "); err != nil {
		return false, fmt.Errorf("write confirmation prompt: %w", err)
	}
	answer, err := bufio.NewReader(input).ReadString('\n')
	if err != nil {
		return false, fmt.Errorf("read confirmation: %w", err)
	}
	return confirmedAnswer(answer), nil
}

func confirmedAnswer(answer string) bool {
	switch strings.ToLower(strings.TrimSpace(answer)) {
	case "y", "yes":
		return true
	default:
		return false
	}
}

func resolveCodexHome(home string) string {
	if configured := os.Getenv("CODEX_HOME"); configured != "" {
		return configured
	}
	return filepath.Join(home, ".codex")
}
