package manager

import (
	"context"
	"errors"
	"testing"
	"time"
)

func Test_AutoReleaseUpdater_doesNotMutate_whenVerificationFails(t *testing.T) {
	// Given
	previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
	store := &memoryLifecycleStore{state: LifecycleState{
		SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}, LastKnownGood: &previous,
	}}
	mutator := &fakeReleaseMutator{version: previous.Version}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: t.TempDir() + "/lifecycle.lock", LockStaleAfter: time.Minute,
	}, store, fixedClock{now: time.Now().UTC()}, &fakeVerifiedReleaseSource{
		err: &ReleaseVerificationError{Source: "npm", Reason: "digest mismatch"},
	}, mutator)

	// When
	_, err := updater.Run(context.Background())

	// Then
	if err == nil || len(mutator.calls) != 0 || len(store.history) != 0 {
		t.Fatalf("error = %v, calls = %#v, history = %#v", err, mutator.calls, store.history)
	}
}

func Test_AutoReleaseUpdater_rejectsPluginOutsideVerifiedMarketplace_beforeMutation(t *testing.T) {
	// Given
	previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
	store := &memoryLifecycleStore{state: LifecycleState{
		SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}, LastKnownGood: &previous,
	}}
	candidate := releaseCandidate()
	candidate.Plugins[0].ID = "nunch-skills-manager@other-marketplace"
	mutator := &fakeReleaseMutator{version: previous.Version}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: t.TempDir() + "/lifecycle.lock", LockStaleAfter: time.Minute,
	}, store, fixedClock{now: time.Now().UTC()}, &fakeVerifiedReleaseSource{
		found: true, candidate: candidate,
	}, mutator)

	// When
	_, err := updater.Run(context.Background())

	// Then
	if !errors.Is(err, ErrAutoReleaseCandidateInvalid) || len(mutator.calls) != 0 || len(store.history) != 0 {
		t.Fatalf("error = %v, calls = %#v, history = %#v", err, mutator.calls, store.history)
	}
}

func Test_AutoReleaseUpdater_doesNotDiscover_whenLifecycleLockIsBusy(t *testing.T) {
	// Given
	now := time.Date(2026, 8, 23, 2, 0, 0, 0, time.UTC)
	lockPath := t.TempDir() + "/lifecycle.lock"
	lock, err := AcquireLifecycleLock(lockPath, "foreground-install", now, time.Minute)
	if err != nil {
		t.Fatalf("AcquireLifecycleLock() error = %v", err)
	}
	defer func() {
		if releaseErr := lock.Release(); releaseErr != nil {
			t.Fatalf("Release() error = %v", releaseErr)
		}
	}()
	source := &fakeVerifiedReleaseSource{}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: lockPath, LockStaleAfter: time.Minute,
	}, &memoryLifecycleStore{}, fixedClock{now: now}, source, &fakeReleaseMutator{})

	// When
	_, err = updater.Run(context.Background())

	// Then
	if !errors.Is(err, ErrLockBusy) || source.calls != 0 {
		t.Fatalf("Run() error = %v, source calls = %d", err, source.calls)
	}
}

func Test_AutoReleaseUpdater_recoversInterruptedOperation_beforeDiscoveringNextRelease(t *testing.T) {
	// Given
	previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
	store := &memoryLifecycleStore{state: LifecycleState{
		SchemaVersion: LifecycleSchemaVersion,
		Resources:     []OwnedResource{},
		LastKnownGood: &previous,
		Operation: &LifecycleOperation{
			ID: "interrupted", Kind: OperationUpdate, Phase: PhaseTrust,
			StartedAt: time.Date(2026, 8, 23, 1, 0, 0, 0, time.UTC),
		},
	}}
	source := &fakeVerifiedReleaseSource{}
	mutator := &fakeReleaseMutator{version: "1.1.0"}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: t.TempDir() + "/lifecycle.lock", LockStaleAfter: time.Minute,
	}, store, fixedClock{now: time.Now().UTC()}, source, mutator)

	// When
	result, err := updater.Run(context.Background())
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if result.Updated || source.calls != 1 || mutator.version != previous.Version || store.state.Operation != nil {
		t.Fatalf(
			"result = %#v, calls = %d, version = %q, state = %#v",
			result,
			source.calls,
			mutator.version,
			store.state,
		)
	}
}

func Test_AutoReleaseUpdater_rollsBack_whenFinalCommitCannotBePersisted(t *testing.T) {
	// Given
	previous := ReleaseState{Version: "1.0.0", Commit: "1111111111111111111111111111111111111111"}
	store := &memoryLifecycleStore{
		state: LifecycleState{
			SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}, LastKnownGood: &previous,
		},
		failAt: 5,
	}
	mutator := &fakeReleaseMutator{version: previous.Version}
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: t.TempDir() + "/lifecycle.lock", LockStaleAfter: time.Minute,
	}, store, fixedClock{now: time.Now().UTC()}, &fakeVerifiedReleaseSource{
		found: true, candidate: releaseCandidate(),
	}, mutator)

	// When
	_, err := updater.Run(context.Background())

	// Then
	if !errors.Is(err, errInjectedReleaseStage) {
		t.Fatalf("Run() error = %v", err)
	}
	if mutator.version != previous.Version || store.state.Operation != nil {
		t.Fatalf("version = %q, state = %#v", mutator.version, store.state)
	}
}
