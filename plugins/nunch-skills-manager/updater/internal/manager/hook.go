package manager

import (
	"errors"
	"fmt"
	"strings"
)

type Launcher interface {
	Launch(executable string, args []string, env []string) error
}

type HookResult struct {
	Started bool
	Notice  string
}

type HookController struct {
	config   RuntimeConfig
	store    Store
	clock    Clock
	launcher Launcher
}

func NewHookController(config RuntimeConfig, store Store, clock Clock, launcher Launcher) *HookController {
	return &HookController{config: config, store: store, clock: clock, launcher: launcher}
}

func (controller *HookController) Run(executable string, env []string) (HookResult, error) {
	state, err := controller.store.Load()
	if err != nil {
		return HookResult{}, fmt.Errorf("load hook state: %w", err)
	}
	result := HookResult{Notice: formatNotice(state.PendingNotice, state.LastError)}
	if state.PendingNotice != nil || state.LastError != "" {
		state.PendingNotice = nil
		state.LastError = ""
		if err := controller.store.Save(state); err != nil {
			return HookResult{}, fmt.Errorf("clear pending notice: %w", err)
		}
	}
	if controller.config.Disabled || !ShouldCheck(
		state,
		controller.clock.Now(),
		controller.config.SuccessInterval,
		controller.config.RetryInterval,
	) {
		return result, nil
	}
	lock, err := AcquireLock(controller.config.LockPath, controller.clock.Now(), controller.config.LockStaleAfter)
	if errors.Is(err, ErrLockBusy) {
		return result, nil
	}
	if err != nil {
		return HookResult{}, err
	}
	childEnv := append(append([]string(nil), env...), "NUNCH_SKILLS_MANAGER_LOCK="+controller.config.LockPath)
	if err := controller.launcher.Launch(executable, []string{"run"}, childEnv); err != nil {
		releaseErr := lock.Release()
		return HookResult{}, errors.Join(fmt.Errorf("launch background updater: %w", err), releaseErr)
	}
	result.Started = true
	return result, nil
}

func formatNotice(notice *PendingNotice, lastError string) string {
	if notice == nil || len(notice.Updates) == 0 && len(notice.Dependencies) == 0 {
		if lastError == "" {
			return ""
		}
		return "[nunch-skills] Automatic update check failed; the existing plugins were kept unchanged: " + lastError
	}
	parts := make([]string, 0, 2)
	updates := make([]string, 0, len(notice.Updates))
	for _, update := range notice.Updates {
		updates = append(updates, fmt.Sprintf("%s %s -> %s", update.PluginID, update.FromVersion, update.ToVersion))
	}
	if len(updates) > 0 {
		parts = append(parts,
			"Automatic update completed: "+strings.Join(updates, ", ")+". Use a new Codex task to load it.",
		)
	}
	dependencies := make([]string, 0, len(notice.Dependencies))
	for _, dependency := range notice.Dependencies {
		dependencies = append(dependencies, fmt.Sprintf(
			"%s for %s", dependency.Requirement, strings.Join(dependency.RequiredBy, ", "),
		))
	}
	if len(dependencies) > 0 {
		parts = append(parts,
			"Missing dependencies: "+strings.Join(dependencies, "; ")+". "+
				"Ask Codex to install nunch-skills dependencies.",
		)
	}
	return "[nunch-skills] " + strings.Join(parts, " ")
}
