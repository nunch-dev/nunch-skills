package manager

import (
	"context"
	"errors"
	"fmt"
	"slices"
)

func (service *LifecycleService) uninstall(
	ctx context.Context,
	command LifecycleCommand,
) (result LifecycleResult, returnErr error) {
	state, err := service.config.Store.Load()
	if err != nil {
		return LifecycleResult{}, fmt.Errorf("load lifecycle state: %w", err)
	}
	managerID := service.config.ManagerName + "@" + service.config.Marketplace
	plan := PlanCreatedUninstall(state, managerID)
	result = LifecycleResult{
		Command: LifecycleUninstall, Targets: slices.Clone(plan.Plugins), DryRun: command.DryRun,
	}
	if command.DryRun || uninstallPlanEmpty(plan) {
		return result, nil
	}
	if !command.Yes {
		return result, ErrConfirmationRequired
	}
	lock, state, err := service.begin(OperationUninstall)
	if err != nil {
		return LifecycleResult{}, err
	}
	defer func() {
		if releaseErr := lock.Release(); releaseErr != nil {
			returnErr = errors.Join(returnErr, releaseErr)
		}
	}()
	if err := service.applyUninstall(ctx, state, plan); err != nil {
		return LifecycleResult{}, err
	}
	return result, nil
}

func (service *LifecycleService) applyUninstall(
	ctx context.Context,
	state LifecycleState,
	plan UninstallPlan,
) error {
	next, err := service.advance(state, PhasePlugins)
	if err != nil {
		return err
	}
	state = next
	for _, plugin := range plan.Plugins {
		if err := service.config.Backend.RemovePlugin(ctx, plugin); err != nil {
			return fmt.Errorf("remove plugin %s: %w", plugin, err)
		}
		state.Resources = removeResource(state.Resources, ResourcePlugin, plugin)
		if err := service.config.Store.Save(state); err != nil {
			return fmt.Errorf("record removed plugin %s: %w", plugin, err)
		}
	}
	state, err = service.advance(state, PhaseTrust)
	if err != nil {
		return err
	}
	if plan.RemoveTrust {
		if err := service.config.Backend.RemoveTrust(ctx, plan.TrustHash); err != nil {
			return fmt.Errorf("remove manager trust: %w", err)
		}
		state.Resources = removeResource(state.Resources, ResourceTrust, ManagerHookTrustID)
		if err := service.config.Store.Save(state); err != nil {
			return fmt.Errorf("record removed manager trust: %w", err)
		}
	}
	if plan.RemoveMarketplace {
		if err := service.config.Backend.RemoveMarketplace(ctx); err != nil {
			return fmt.Errorf("remove marketplace: %w", err)
		}
		state.Resources = removeResource(state.Resources, ResourceMarketplace, service.config.Marketplace)
		if err := service.config.Store.Save(state); err != nil {
			return fmt.Errorf("record removed marketplace: %w", err)
		}
	}
	return service.commitUninstall(state)
}

func (service *LifecycleService) commitUninstall(state LifecycleState) error {
	state.Resources = preserveUnownedResources(state.Resources)
	state, err := service.advance(state, PhaseVerify)
	if err != nil {
		return err
	}
	state, err = CompleteLifecycleOperation(state, ReleaseState{
		Version: service.config.Manifest.NPM.Version,
		Commit:  service.config.Manifest.Git.Commit,
	})
	if err != nil {
		return err
	}
	state.LastKnownGood = nil
	if err := service.config.Store.Save(state); err != nil {
		return fmt.Errorf("commit uninstall state: %w", err)
	}
	return nil
}

func uninstallPlanEmpty(plan UninstallPlan) bool {
	return len(plan.Plugins) == 0 && !plan.RemoveTrust && !plan.RemoveMarketplace
}
