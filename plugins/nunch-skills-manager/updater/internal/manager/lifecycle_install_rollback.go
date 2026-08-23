package manager

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

type installRollbackJournal struct {
	plugins            []string
	trustHash          string
	marketplaceCreated bool
}

func (service *LifecycleService) recoverPendingInstall(ctx context.Context) (returnErr error) {
	state, err := service.config.Store.Load()
	if err != nil {
		return fmt.Errorf("load pending install recovery: %w", err)
	}
	if state.Operation == nil ||
		state.Operation.Kind != OperationInstall {
		return nil
	}
	now := service.config.Clock.Now()
	owner := fmt.Sprintf("recover-install-%d", now.UnixNano())
	lock, err := AcquireLifecycleLock(service.config.LockPath, owner, now, service.config.LockStaleAfter)
	if err != nil {
		return fmt.Errorf("acquire install recovery lock: %w", err)
	}
	defer func() {
		if releaseErr := lock.Release(); releaseErr != nil {
			returnErr = errors.Join(returnErr, releaseErr)
		}
	}()
	journal := service.installJournalFromCreatedResources(state.Operation.CreatedResources)
	if err := service.rollbackInstall(ctx, journal); err != nil {
		return err
	}
	return nil
}

func (service *LifecycleService) installJournalFromCreatedResources(
	resources []OwnedResource,
) installRollbackJournal {
	journal := installRollbackJournal{}
	for _, resource := range resources {
		if resource.Ownership != OwnershipCreated {
			continue
		}
		switch resource.Kind {
		case ResourceMarketplace:
			journal.marketplaceCreated = resource.Name == service.config.Marketplace
		case ResourcePlugin:
			journal.plugins = append(journal.plugins, resource.Name)
		case ResourceTrust:
			if resource.Name == ManagerHookTrustID {
				journal.trustHash = resource.PreStateFingerprint
			}
		case ResourceData:
		}
	}
	managerID := service.config.ManagerName + "@" + service.config.Marketplace
	sort.Slice(journal.plugins, func(left, right int) bool {
		leftManager := journal.plugins[left] == managerID
		rightManager := journal.plugins[right] == managerID
		if leftManager != rightManager {
			return leftManager
		}
		return journal.plugins[left] < journal.plugins[right]
	})
	return journal
}

func (service *LifecycleService) rollbackInstall(
	ctx context.Context,
	journal installRollbackJournal,
) error {
	state, err := service.config.Store.Load()
	if err != nil {
		return fmt.Errorf("load install rollback state: %w", err)
	}
	if state.Operation == nil {
		return nil
	}
	if state.Operation.Phase != PhaseRollback {
		state, err = AdvanceLifecycleOperation(state, PhaseRollback)
		if err != nil {
			return fmt.Errorf("start install rollback: %w", err)
		}
		if err := service.config.Store.Save(state); err != nil {
			return fmt.Errorf("record install rollback: %w", err)
		}
	}
	rollbackErr := service.removeInstallJournal(ctx, &state, journal)
	if rollbackErr != nil {
		if saveErr := service.config.Store.Save(state); saveErr != nil {
			rollbackErr = errors.Join(rollbackErr, saveErr)
		}
		return fmt.Errorf("rollback partial install: %w", rollbackErr)
	}
	state, err = CompleteLifecycleRollback(state)
	if err != nil {
		return fmt.Errorf("complete install rollback: %w", err)
	}
	if err := service.config.Store.Save(state); err != nil {
		return fmt.Errorf("save completed install rollback: %w", err)
	}
	return nil
}

func (service *LifecycleService) removeInstallJournal(
	ctx context.Context,
	state *LifecycleState,
	journal installRollbackJournal,
) error {
	var rollbackErr error
	if journal.trustHash != "" {
		if err := service.config.Backend.RemoveTrust(ctx, journal.trustHash); err != nil {
			rollbackErr = errors.Join(rollbackErr, fmt.Errorf("remove created trust: %w", err))
		} else {
			state.Resources = removeResource(state.Resources, ResourceTrust, ManagerHookTrustID)
		}
	}
	for index := len(journal.plugins) - 1; index >= 0; index-- {
		plugin := journal.plugins[index]
		if err := service.config.Backend.RemovePlugin(ctx, plugin); err != nil {
			rollbackErr = errors.Join(rollbackErr, fmt.Errorf("remove created plugin %s: %w", plugin, err))
		} else {
			state.Resources = removeResource(state.Resources, ResourcePlugin, plugin)
		}
	}
	if journal.marketplaceCreated {
		if err := service.config.Backend.RemoveMarketplace(ctx); err != nil {
			rollbackErr = errors.Join(rollbackErr, fmt.Errorf("remove created marketplace: %w", err))
		} else {
			state.Resources = removeResource(
				state.Resources,
				ResourceMarketplace,
				service.config.Marketplace,
			)
		}
	}
	return rollbackErr
}
