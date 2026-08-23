package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager"
)

type hookSpecificOutput struct {
	HookEventName     string `json:"hookEventName"`
	AdditionalContext string `json:"additionalContext"`
}

type hookOutput struct {
	Output hookSpecificOutput `json:"hookSpecificOutput"`
}

type hookRunner interface {
	Run(executable string, env []string) (manager.HookResult, error)
}

func main() {
	os.Exit(run(os.Args))
}

func run(args []string) int {
	return runWith(args, os.Stdout, os.Stderr)
}

func runWith(args []string, stdout, stderr io.Writer) int {
	if len(args) == 2 && (args[1] == "--help" || args[1] == "help") {
		return writeLine(stdout, usage(), 0)
	}
	if len(args) == 2 && args[1] == "--version" {
		return writeLine(stdout, manager.CLIVersion(), 0)
	}
	if err := validateCLIArgs(args); err != nil {
		return writeUsageError(stderr, err)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return writeError(stderr, fmt.Errorf("resolve home directory: %w", err))
	}
	config, err := manager.LoadRuntimeConfig(os.Getenv, home)
	if err != nil {
		return writeError(stderr, err)
	}
	return dispatchCommand(args, config, home, stdout, stderr)
}

func validateCLIArgs(args []string) error {
	if len(args) < 2 {
		return manager.ErrInvalidLifecycleCommand
	}
	if args[1] == "hook" || args[1] == "run" {
		if len(args) != 2 {
			return manager.ErrInvalidLifecycleCommand
		}
		return nil
	}
	_, err := manager.ParseLifecycleCommand(args[1:])
	return err
}

func dispatchCommand(
	args []string,
	config manager.RuntimeConfig,
	home string,
	stdout, stderr io.Writer,
) int {
	switch args[1] {
	case "doctor":
		return runDoctor(config, home, stdout, stderr)
	case "hook":
		return runHook(config)
	case "run":
		return runUpdate(config, home)
	case "install", "uninstall", "update":
		command, parseErr := manager.ParseLifecycleCommand(args[1:])
		if parseErr != nil {
			return writeUsageError(stderr, parseErr)
		}
		return runLifecycle(config, home, command, stdout, stderr)
	default:
		return writeUsageError(stderr, manager.ErrInvalidLifecycleCommand)
	}
}

func writeLine(writer io.Writer, value string, successCode int) int {
	if _, err := fmt.Fprintln(writer, value); err != nil {
		return 1
	}
	return successCode
}

func writeError(writer io.Writer, err error) int {
	return writeLine(writer, err.Error(), 1)
}

func writeUsageError(writer io.Writer, err error) int {
	if _, writeErr := fmt.Fprintf(writer, "%s\n%s\n", err, usage()); writeErr != nil {
		return 1
	}
	return 2
}

func usage() string {
	return "usage: nunch-skills <install|update|uninstall|doctor> [plugins] [--all] [--dry-run] [--yes]"
}

func runHook(config manager.RuntimeConfig) int {
	executable, err := os.Executable()
	if err != nil {
		return emitHookFailure(fmt.Errorf("resolve updater executable: %w", err))
	}
	store := manager.NewFileStore(config.StatePath)
	controller := manager.NewHookController(config, store, manager.SystemClock{}, manager.DetachedLauncher{})
	return runHookWith(config, executable, manager.ExecRunner{}, store, controller)
}

func runHookWith(
	config manager.RuntimeConfig,
	executable string,
	runner manager.Runner,
	store manager.Store,
	controller hookRunner,
) int {
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	initializationNotice := ""
	initialization, initializationErr := manager.InspectDependencyInitialization(ctx, config.Manager, runner, store)
	if initializationErr != nil {
		initializationNotice = hookFailureNotice(initializationErr)
	} else if initialization.Changed {
		initializationNotice = manager.FormatDependencyGuidance(initialization.Report)
	}
	result, err := controller.Run(executable, os.Environ())
	if err != nil {
		return emitHookNotice(joinNotices(initializationNotice, hookFailureNotice(err)))
	}
	notice := joinNotices(initializationNotice, result.Notice)
	if notice != "" {
		return emitHookNotice(notice)
	}
	return 0
}

func joinNotices(notices ...string) string {
	joined := ""
	for _, notice := range notices {
		if notice == "" {
			continue
		}
		if joined != "" {
			joined += " "
		}
		joined += notice
	}
	return joined
}

func runUpdate(config manager.RuntimeConfig, home string) int {
	lock, err := resolveRunLock(config)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if lock == nil {
		return 0
	}
	defer func() {
		if err := lock.Release(); err != nil {
			fmt.Fprintln(os.Stderr, err)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	autoRelease, err := manager.NewProductionAutoRelease(config, resolveCodexHome(home), os.Getenv)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	service := manager.NewWithAutoRelease(
		config.Manager,
		manager.ExecRunner{},
		manager.NewFileStore(config.StatePath),
		manager.SystemClock{},
		autoRelease.Updater,
	)
	if _, err := service.Run(ctx); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func resolveRunLock(config manager.RuntimeConfig) (*manager.Lock, error) {
	if path := os.Getenv("NUNCH_SKILLS_MANAGER_LOCK"); path != "" {
		return manager.AdoptLock(path), nil
	}
	return manager.AcquireLock(config.LockPath, time.Now().UTC(), config.LockStaleAfter)
}

func emitHookFailure(err error) int {
	return emitHookNotice(hookFailureNotice(err))
}

func hookFailureNotice(err error) string {
	return "[nunch-skills] Automatic update manager failed safely; existing plugins were kept unchanged: " +
		err.Error()
}

func emitHookNotice(message string) int {
	payload := hookOutput{Output: hookSpecificOutput{HookEventName: "SessionStart", AdditionalContext: message}}
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}
