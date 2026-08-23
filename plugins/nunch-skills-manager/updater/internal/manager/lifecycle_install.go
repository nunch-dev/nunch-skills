package manager

import (
	"context"
	"errors"
	"fmt"
	"slices"
)

type installPreparation struct {
	marketplaceExists bool
	plugins           PluginList
	targets           []string
}

func (service *LifecycleService) install(
	ctx context.Context,
	command LifecycleCommand,
) (result LifecycleResult, returnErr error) {
	if command.DryRun {
		preparation, err := service.prepareInstall(ctx, command)
		if err != nil {
			return LifecycleResult{}, err
		}
		return LifecycleResult{
			Command: LifecycleInstall, Targets: preparation.targets, DryRun: true,
		}, nil
	}
	if err := service.recoverPendingInstall(ctx); err != nil {
		return LifecycleResult{}, err
	}
	preparation, err := service.prepareInstall(ctx, command)
	if err != nil {
		return LifecycleResult{}, err
	}
	result = LifecycleResult{
		Command: LifecycleInstall, Targets: preparation.targets,
	}
	lock, state, err := service.begin(OperationInstall)
	if err != nil {
		return LifecycleResult{}, err
	}
	defer func() {
		if releaseErr := lock.Release(); releaseErr != nil {
			returnErr = errors.Join(returnErr, releaseErr)
		}
	}()
	journal := installRollbackJournal{}
	if err := service.applyInstall(ctx, state, preparation, &journal); err != nil {
		rollbackErr := service.rollbackInstall(ctx, journal)
		return LifecycleResult{}, errors.Join(err, rollbackErr)
	}
	return result, nil
}

func (service *LifecycleService) prepareInstall(
	ctx context.Context,
	command LifecycleCommand,
) (installPreparation, error) {
	exists, err := service.config.Backend.Marketplace(ctx)
	if err != nil {
		return installPreparation{}, fmt.Errorf("inspect marketplace: %w", err)
	}
	plugins := PluginList{}
	if exists {
		plugins, err = service.config.Backend.Plugins(ctx)
		if err != nil {
			return installPreparation{}, fmt.Errorf("list plugins: %w", err)
		}
	}
	available := pluginNames(plugins)
	if !exists {
		available = releasePluginNames(service.config.Manifest.Plugins)
		if !command.All {
			available = append(slices.Clone(command.Plugins), service.config.ManagerName)
		}
	}
	targets, err := ResolveInstallTargets(
		available,
		command.Plugins,
		command.All,
		service.config.ManagerName,
	)
	if err != nil {
		return installPreparation{}, err
	}
	return installPreparation{marketplaceExists: exists, plugins: plugins, targets: targets}, nil
}

func releasePluginNames(plugins []ReleasePlugin) []string {
	names := make([]string, 0, len(plugins))
	for _, plugin := range plugins {
		names = append(names, plugin.Name)
	}
	return names
}

func (service *LifecycleService) applyInstall(
	ctx context.Context,
	state LifecycleState,
	preparation installPreparation,
	journal *installRollbackJournal,
) error {
	journal.marketplaceCreated = !preparation.marketplaceExists
	if journal.marketplaceCreated {
		var err error
		state, err = service.recordCreatedIntent(state, OwnedResource{
			Kind: ResourceMarketplace, Name: service.config.Marketplace, Ownership: OwnershipCreated,
		})
		if err != nil {
			return fmt.Errorf("record marketplace creation intent: %w", err)
		}
	}
	if err := service.config.Backend.PinMarketplace(ctx, service.config.Manifest.Git.Commit); err != nil {
		return fmt.Errorf("pin marketplace: %w", err)
	}
	if preparation.marketplaceExists {
		state = service.recordMarketplace(state, true)
	}
	next, err := service.advance(state, PhasePlugins)
	if err != nil {
		return err
	}
	state = next
	before := installedByName(preparation.plugins)
	for _, target := range preparation.targets {
		if before[target].ID == "" {
			pluginID := target + "@" + service.config.Marketplace
			journal.plugins = append(journal.plugins, pluginID)
			state, err = service.recordCreatedIntent(state, OwnedResource{
				Kind: ResourcePlugin, Name: pluginID, Ownership: OwnershipCreated,
			})
			if err != nil {
				return fmt.Errorf("record plugin creation intent %s: %w", target, err)
			}
		}
		if err := service.config.Backend.Install(ctx, target); err != nil {
			return fmt.Errorf("install plugin %s: %w", target, err)
		}
		if before[target].ID != "" {
			state = recordPluginResource(state, target, service.config.Marketplace, before[target])
		}
		if err := service.config.Store.Save(state); err != nil {
			return fmt.Errorf("record installed plugin %s: %w", target, err)
		}
	}
	return service.applyInstallTrust(ctx, state, journal)
}

func (service *LifecycleService) applyInstallTrust(
	ctx context.Context,
	state LifecycleState,
	journal *installRollbackJournal,
) error {
	next, err := service.advance(state, PhaseTrust)
	if err != nil {
		return err
	}
	ownership, hash, err := service.config.Backend.TrustIntent(ctx, service.config.Manifest)
	if err != nil {
		return fmt.Errorf("inspect manager hook trust: %w", err)
	}
	if ownership == OwnershipCreated {
		journal.trustHash = hash
		next, err = service.recordCreatedIntent(next, OwnedResource{
			Kind: ResourceTrust, Name: ManagerHookTrustID,
			Ownership: OwnershipCreated, PreStateFingerprint: hash,
		})
		if err != nil {
			return fmt.Errorf("record trust creation intent: %w", err)
		}
	}
	if err := service.config.Backend.Trust(ctx, service.config.Manifest, ownership, hash); err != nil {
		return fmt.Errorf("trust manager hook: %w", err)
	}
	state = recordResource(next, ResourceTrust, ManagerHookTrustID, ownership, hash)
	state, err = service.advance(state, PhaseVerify)
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
	if err := service.config.Store.Save(state); err != nil {
		return fmt.Errorf("commit install state: %w", err)
	}
	return nil
}
