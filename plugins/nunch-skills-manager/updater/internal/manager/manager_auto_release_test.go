package manager

import (
	"context"
	"errors"
	"testing"
	"time"
)

type fakeAutoReleaseRunner struct {
	result AutoReleaseResult
	err    error
	calls  int
}

func (runner *fakeAutoReleaseRunner) Run(_ context.Context) (AutoReleaseResult, error) {
	runner.calls++
	return runner.result, runner.err
}

func Test_ManagerRun_usesVerifiedAutoRelease_withoutMovableMarketplaceUpgrade(t *testing.T) {
	// Given
	auto := &fakeAutoReleaseRunner{result: AutoReleaseResult{
		Updated: true,
		Release: ReleaseState{
			Version: "1.1.0", Commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
		Updates: []Update{{
			PluginID: "nunch-skills-manager@nunch-skills", FromVersion: "1.0.0", ToVersion: "1.1.0",
		}},
	}}
	runner := &fakeRunner{responses: []commandResponse{{output: []byte(`{"installed":[]}`)}}}
	store := &memoryStore{}
	service := NewWithAutoRelease(Config{
		CodexCommand: "codex", Marketplace: "nunch-skills", ManagerPlugin: defaultManagerPlugin,
	}, runner, store, fixedClock{now: time.Date(2026, 8, 23, 3, 0, 0, 0, time.UTC)}, auto)

	// When
	result, err := service.Run(context.Background())
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if auto.calls != 1 || len(result.Updates) != 1 || len(runner.calls) != 1 {
		t.Fatalf("auto calls = %d, result = %#v, runner calls = %#v", auto.calls, result, runner.calls)
	}
	if len(runner.calls[0].args) < 2 || runner.calls[0].args[0] != "plugin" || runner.calls[0].args[1] != "list" {
		t.Fatalf("runner calls = %#v", runner.calls)
	}
	if store.state.LastStatus != StatusSuccess || store.state.PendingNotice == nil {
		t.Fatalf("state = %#v", store.state)
	}
}

func Test_ManagerRun_preservesLastKnownGoodNotice_whenVerifiedAutoReleaseFails(t *testing.T) {
	// Given
	auto := &fakeAutoReleaseRunner{err: &ReleaseVerificationError{Source: "git", Reason: "digest mismatch"}}
	runner := &fakeRunner{}
	store := &memoryStore{}
	service := NewWithAutoRelease(Config{}, runner, store, fixedClock{now: time.Now().UTC()}, auto)

	// When
	_, err := service.Run(context.Background())

	// Then
	var verificationErr *ReleaseVerificationError
	if !errors.As(err, &verificationErr) {
		t.Fatalf("Run() error = %v", err)
	}
	if len(runner.calls) != 0 || store.state.LastStatus != StatusFailed || store.state.LastError == "" {
		t.Fatalf("runner calls = %#v, state = %#v", runner.calls, store.state)
	}
}
