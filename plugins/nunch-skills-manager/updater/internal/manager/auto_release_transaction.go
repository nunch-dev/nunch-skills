package manager

import (
	"context"
	"errors"
	"fmt"
	"sort"
)

func (updater *AutoReleaseUpdater) savePhase(
	state LifecycleState,
	phase OperationPhase,
) (LifecycleState, error) {
	next, err := AdvanceLifecycleOperation(state, phase)
	if err != nil {
		return state, err
	}
	if err := updater.store.Save(next); err != nil {
		return next, fmt.Errorf("record release phase %s: %w", phase, err)
	}
	return next, nil
}

func (updater *AutoReleaseUpdater) rollback(
	ctx context.Context,
	state LifecycleState,
	previous ReleaseState,
	cause error,
) error {
	if state.Operation == nil {
		return cause
	}
	operationID := state.Operation.ID
	if state.Operation.Phase != PhaseRollback {
		rolledBack, err := AdvanceLifecycleOperation(state, PhaseRollback)
		if err != nil {
			return errors.Join(cause, fmt.Errorf("prepare release rollback: %w", err))
		}
		state = rolledBack
		if err := updater.store.Save(state); err != nil {
			return errors.Join(cause, fmt.Errorf("record release rollback: %w", err))
		}
	}
	if err := updater.mutator.Rollback(ctx, operationID, previous); err != nil {
		return errors.Join(cause, fmt.Errorf("rollback release %s: %w", operationID, err))
	}
	state, err := CompleteLifecycleRollback(state)
	if err != nil {
		return errors.Join(cause, err)
	}
	if err := updater.store.Save(state); err != nil {
		return errors.Join(cause, fmt.Errorf("complete release rollback: %w", err))
	}
	return cause
}

func validateAutoReleaseCandidate(candidate AutoReleaseCandidate) error {
	if candidate.Release.Package != "@nunch-dev/skills" ||
		!validSemver(candidate.Release.Version) ||
		!hexCommitPattern.MatchString(candidate.Release.Commit) ||
		len(candidate.Plugins) == 0 {
		return ErrAutoReleaseCandidateInvalid
	}
	seen := make(map[string]struct{}, len(candidate.Plugins))
	managerCount := 0
	for _, plugin := range candidate.Plugins {
		if plugin.ID != plugin.Name+"@nunch-skills" ||
			!validSemver(plugin.FromVersion) ||
			!validSemver(plugin.Version) {
			return ErrAutoReleaseCandidateInvalid
		}
		if _, found := seen[plugin.ID]; found {
			return ErrAutoReleaseCandidateInvalid
		}
		seen[plugin.ID] = struct{}{}
		if plugin.Name == defaultManagerPlugin {
			managerCount++
		}
	}
	if managerCount != 1 {
		return ErrAutoReleaseCandidateInvalid
	}
	return nil
}

func managerLast(plugins []AutoReleasePlugin) []AutoReleasePlugin {
	ordered := append([]AutoReleasePlugin(nil), plugins...)
	sort.Slice(ordered, func(left, right int) bool {
		leftManager := ordered[left].Name == defaultManagerPlugin
		rightManager := ordered[right].Name == defaultManagerPlugin
		if leftManager != rightManager {
			return !leftManager
		}
		return ordered[left].ID < ordered[right].ID
	})
	return ordered
}

func sameRelease(current ReleaseState, candidate VerifiedRelease) bool {
	return current.Version == candidate.Version && current.Commit == candidate.Commit
}
