package manager

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var (
	ErrAutoReleaseNeedsLastKnownGood = errors.New("automatic release update requires a last-known-good release")
	ErrAutoReleaseCandidateInvalid   = errors.New("verified release candidate is invalid")
)

type AutoReleaseConfig struct {
	LockPath       string
	LockStaleAfter time.Duration
}

type AutoReleasePlugin struct {
	ID          string
	Name        string
	FromVersion string
	Version     string
}

type AutoReleaseCandidate struct {
	Release  VerifiedRelease
	Manifest ReleaseManifest
	Plugins  []AutoReleasePlugin
}

type AutoReleaseResult struct {
	Updated bool
	Release ReleaseState
	Updates []Update
}

type VerifiedReleaseSource interface {
	DiscoverAndVerify(ctx context.Context, current *ReleaseState) (AutoReleaseCandidate, bool, error)
}

type AutoReleaseMutator interface {
	Snapshot(ctx context.Context, operationID string) error
	PinMarketplace(ctx context.Context, candidate AutoReleaseCandidate) error
	UpdatePlugin(ctx context.Context, plugin AutoReleasePlugin) error
	UpdateExactTrust(ctx context.Context, candidate AutoReleaseCandidate) error
	VerifyFinal(ctx context.Context, candidate AutoReleaseCandidate) error
	Commit(operationID string) error
	Rollback(ctx context.Context, operationID string, release ReleaseState) error
}

type LifecycleStateStore interface {
	Load() (LifecycleState, error)
	Save(state LifecycleState) error
}

type AutoReleaseUpdater struct {
	config  AutoReleaseConfig
	store   LifecycleStateStore
	clock   Clock
	source  VerifiedReleaseSource
	mutator AutoReleaseMutator
}

func NewAutoReleaseUpdater(
	config AutoReleaseConfig,
	store LifecycleStateStore,
	clock Clock,
	source VerifiedReleaseSource,
	mutator AutoReleaseMutator,
) *AutoReleaseUpdater {
	return &AutoReleaseUpdater{config: config, store: store, clock: clock, source: source, mutator: mutator}
}

func (updater *AutoReleaseUpdater) Run(ctx context.Context) (result AutoReleaseResult, err error) {
	owner := fmt.Sprintf("auto-release-%d", updater.clock.Now().UnixNano())
	lock, err := AcquireLifecycleLock(
		updater.config.LockPath,
		owner,
		updater.clock.Now(),
		updater.config.LockStaleAfter,
	)
	if err != nil {
		return AutoReleaseResult{}, fmt.Errorf("acquire automatic release lock: %w", err)
	}
	defer func() { err = errors.Join(err, lock.Release()) }()

	state, err := updater.store.Load()
	if err != nil {
		return AutoReleaseResult{}, fmt.Errorf("load lifecycle state: %w", err)
	}
	state, err = updater.recoverInterrupted(ctx, state)
	if err != nil {
		return AutoReleaseResult{}, err
	}
	if state.LastKnownGood == nil {
		return AutoReleaseResult{}, ErrAutoReleaseNeedsLastKnownGood
	}
	candidate, found, err := updater.source.DiscoverAndVerify(ctx, state.LastKnownGood)
	if err != nil {
		return AutoReleaseResult{}, fmt.Errorf("discover and verify release: %w", err)
	}
	if !found || sameRelease(*state.LastKnownGood, candidate.Release) {
		return AutoReleaseResult{}, nil
	}
	if err := validateAutoReleaseCandidate(candidate); err != nil {
		return AutoReleaseResult{}, err
	}
	result, err = updater.apply(ctx, state, candidate)
	if err != nil {
		return AutoReleaseResult{}, fmt.Errorf(
			"apply verified npm release %s (%s): %w",
			candidate.Release.Version,
			candidate.Release.Commit[:12],
			err,
		)
	}
	return result, nil
}

func (updater *AutoReleaseUpdater) recoverInterrupted(
	ctx context.Context,
	state LifecycleState,
) (LifecycleState, error) {
	if state.Operation == nil {
		return state, nil
	}
	if state.LastKnownGood == nil {
		return LifecycleState{}, ErrAutoReleaseNeedsLastKnownGood
	}
	operationID := state.Operation.ID
	if state.Operation.Phase != PhaseRollback {
		var err error
		state, err = AdvanceLifecycleOperation(state, PhaseRollback)
		if err != nil {
			return LifecycleState{}, err
		}
		if err := updater.store.Save(state); err != nil {
			return LifecycleState{}, fmt.Errorf("record interrupted rollback: %w", err)
		}
	}
	if err := updater.mutator.Rollback(ctx, operationID, *state.LastKnownGood); err != nil {
		return LifecycleState{}, fmt.Errorf("rollback interrupted release %s: %w", operationID, err)
	}
	state, err := CompleteLifecycleRollback(state)
	if err != nil {
		return LifecycleState{}, err
	}
	if err := updater.store.Save(state); err != nil {
		return LifecycleState{}, fmt.Errorf("complete interrupted rollback: %w", err)
	}
	return state, nil
}

func (updater *AutoReleaseUpdater) apply(
	ctx context.Context,
	state LifecycleState,
	candidate AutoReleaseCandidate,
) (AutoReleaseResult, error) {
	previous := *state.LastKnownGood
	operationID := "auto-" + candidate.Release.Version + "-" + candidate.Release.Commit[:12]
	operation := LifecycleOperation{
		ID: operationID, Kind: OperationUpdate, Phase: PhasePrepared, StartedAt: updater.clock.Now(),
	}
	state, err := BeginLifecycleOperation(state, operation)
	if err != nil {
		return AutoReleaseResult{}, err
	}
	if err := updater.store.Save(state); err != nil {
		return AutoReleaseResult{}, fmt.Errorf("record verified release: %w", err)
	}
	updates, err := updater.stagePlugins(ctx, candidate, operationID)
	if err != nil {
		return AutoReleaseResult{}, updater.rollback(ctx, state, previous, err)
	}
	state, err = updater.savePhase(state, PhasePlugins)
	if err != nil {
		return AutoReleaseResult{}, updater.rollback(ctx, state, previous, err)
	}
	if err := updater.mutator.UpdateExactTrust(ctx, candidate); err != nil {
		return AutoReleaseResult{}, updater.rollback(
			ctx, state, previous, fmt.Errorf("update exact hook trust: %w", err),
		)
	}
	state, err = updater.savePhase(state, PhaseTrust)
	if err != nil {
		return AutoReleaseResult{}, updater.rollback(ctx, state, previous, err)
	}
	if err := updater.mutator.VerifyFinal(ctx, candidate); err != nil {
		return AutoReleaseResult{}, updater.rollback(
			ctx, state, previous, fmt.Errorf("verify final release: %w", err),
		)
	}
	state, err = updater.savePhase(state, PhaseVerify)
	if err != nil {
		return AutoReleaseResult{}, updater.rollback(ctx, state, previous, err)
	}
	release := ReleaseState{Version: candidate.Release.Version, Commit: candidate.Release.Commit}
	verifiedState := state
	state, err = CompleteLifecycleOperation(verifiedState, release)
	if err != nil {
		return AutoReleaseResult{}, updater.rollback(ctx, verifiedState, previous, err)
	}
	if err := updater.store.Save(state); err != nil {
		return AutoReleaseResult{}, updater.rollback(
			ctx, verifiedState, previous, fmt.Errorf("commit release state: %w", err),
		)
	}
	if err := updater.mutator.Commit(operationID); err != nil {
		return AutoReleaseResult{}, fmt.Errorf("remove committed release snapshot: %w", err)
	}
	return AutoReleaseResult{Updated: true, Release: release, Updates: updates}, nil
}

func (updater *AutoReleaseUpdater) stagePlugins(
	ctx context.Context,
	candidate AutoReleaseCandidate,
	operationID string,
) ([]Update, error) {
	if err := updater.mutator.Snapshot(ctx, operationID); err != nil {
		return nil, fmt.Errorf("snapshot release state: %w", err)
	}
	if err := updater.mutator.PinMarketplace(ctx, candidate); err != nil {
		return nil, fmt.Errorf("pin release marketplace: %w", err)
	}
	plugins := managerLast(candidate.Plugins)
	updates := make([]Update, 0, len(plugins))
	for _, plugin := range plugins {
		if err := updater.mutator.UpdatePlugin(ctx, plugin); err != nil {
			return nil, fmt.Errorf("update plugin %s: %w", plugin.ID, err)
		}
		updates = append(updates, Update{
			PluginID: plugin.ID, FromVersion: plugin.FromVersion, ToVersion: plugin.Version,
		})
	}
	return updates, nil
}
