package main

import (
	"context"
	"encoding/json"
	"fmt"
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

func main() {
	os.Exit(run(os.Args))
}

func run(args []string) int {
	if len(args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: nunch-skills-manager <doctor|hook|run>")
		return 2
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return emitHookFailure(fmt.Errorf("resolve home directory: %w", err))
	}
	config, err := manager.LoadRuntimeConfig(os.Getenv, home)
	if err != nil {
		return emitHookFailure(err)
	}
	switch args[1] {
	case "doctor":
		return runDoctor(config)
	case "hook":
		return runHook(config)
	case "run":
		return runUpdate(config)
	default:
		fmt.Fprintln(os.Stderr, "usage: nunch-skills-manager <doctor|hook|run>")
		return 2
	}
}

func runDoctor(config manager.RuntimeConfig) int {
	ctx, cancel := context.WithTimeout(context.Background(), config.CommandTimeout)
	defer cancel()
	report, err := manager.DiagnoseDependencies(ctx, config.Manager, manager.ExecRunner{})
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	if err := json.NewEncoder(os.Stdout).Encode(report); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}

func runHook(config manager.RuntimeConfig) int {
	executable, err := os.Executable()
	if err != nil {
		return emitHookFailure(fmt.Errorf("resolve updater executable: %w", err))
	}
	store := manager.NewFileStore(config.StatePath)
	controller := manager.NewHookController(config, store, manager.SystemClock{}, manager.DetachedLauncher{})
	result, err := controller.Run(executable, os.Environ())
	if err != nil {
		return emitHookFailure(err)
	}
	if result.Notice != "" {
		return emitHookNotice(result.Notice)
	}
	return 0
}

func runUpdate(config manager.RuntimeConfig) int {
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
	service := manager.New(
		config.Manager,
		manager.ExecRunner{},
		manager.NewFileStore(config.StatePath),
		manager.SystemClock{},
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
	return emitHookNotice(
		"[nunch-skills] Automatic update manager failed safely; existing plugins were kept unchanged: " +
			err.Error(),
	)
}

func emitHookNotice(message string) int {
	payload := hookOutput{Output: hookSpecificOutput{HookEventName: "SessionStart", AdditionalContext: message}}
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}
