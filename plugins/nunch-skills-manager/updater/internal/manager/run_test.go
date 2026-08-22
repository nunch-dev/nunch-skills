package manager

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"
)

type commandResponse struct {
	output []byte
	err    error
}

type commandCall struct {
	name string
	args []string
}

type fakeRunner struct {
	responses []commandResponse
	calls     []commandCall
}

func (runner *fakeRunner) Run(_ context.Context, name string, args ...string) ([]byte, error) {
	runner.calls = append(runner.calls, commandCall{name: name, args: append([]string(nil), args...)})
	response := runner.responses[0]
	runner.responses = runner.responses[1:]
	return response.output, response.err
}

type memoryStore struct {
	state State
}

func (store *memoryStore) Load() (State, error) {
	return store.state, nil
}

func (store *memoryStore) Save(state State) error {
	store.state = state
	return nil
}

type fixedClock struct {
	now time.Time
}

func (clock fixedClock) Now() time.Time {
	return clock.now
}

func Test_ManagerRun_reinstalls_changed_plugins_when_marketplace_version_changes(t *testing.T) {
	// Given
	before := []byte(`{"installed":[{` +
		`"pluginId":"deep-interview@nunch-skills","name":"deep-interview",` +
		`"version":"0.1.0","installed":true},{` +
		`"pluginId":"nunch-skills-manager@nunch-skills","name":"nunch-skills-manager",` +
		`"version":"0.1.0","installed":true}]}`)
	runner := &fakeRunner{responses: []commandResponse{
		{output: before},
		{output: []byte(`{"upgraded":true}`)},
		{output: []byte(`{"pluginId":"deep-interview@nunch-skills","name":"deep-interview","version":"0.2.0"}`)},
		{output: []byte(`{"pluginId":"nunch-skills-manager@nunch-skills",` +
			`"name":"nunch-skills-manager","version":"0.2.0"}`)},
		{output: []byte("Python 3.13.7")},
		{output: []byte("uv 0.8.13")},
	}}
	store := &memoryStore{}
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	service := New(Config{
		CodexCommand:  "codex",
		Marketplace:   "nunch-skills",
		ManagerPlugin: "nunch-skills-manager",
	}, runner, store, fixedClock{now: now})

	// When
	result, err := service.Run(context.Background())
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	wantCalls := []commandCall{
		{name: "codex", args: []string{"plugin", "list", "--marketplace", "nunch-skills", "--json", "--available"}},
		{name: "codex", args: []string{"plugin", "marketplace", "upgrade", "nunch-skills", "--json"}},
		{name: "codex", args: []string{"plugin", "add", "deep-interview@nunch-skills", "--json"}},
		{name: "codex", args: []string{"plugin", "add", "nunch-skills-manager@nunch-skills", "--json"}},
		{name: "python3", args: []string{"--version"}},
		{name: "uv", args: []string{"--version"}},
	}
	if !reflect.DeepEqual(runner.calls, wantCalls) {
		t.Fatalf("calls = %#v, want %#v", runner.calls, wantCalls)
	}
	if len(result.Updates) != 2 || store.state.LastStatus != StatusSuccess || store.state.PendingNotice == nil {
		t.Fatalf("result = %#v, state = %#v", result, store.state)
	}
}

func Test_ManagerRun_records_missing_dependencies_without_failing_update(t *testing.T) {
	// Given
	before := []byte(`{"installed":[{` +
		`"pluginId":"git-tools@nunch-skills","name":"git-tools",` +
		`"version":"0.2.0","installed":true}]}`)
	runner := &fakeRunner{responses: []commandResponse{
		{output: before},
		{output: []byte(`{"upgraded":true}`)},
		{output: []byte(`{"pluginId":"git-tools@nunch-skills","name":"git-tools","version":"0.2.0"}`)},
		{err: errors.New("git not found")},
	}}
	store := &memoryStore{}
	service := New(Config{
		CodexCommand:  "codex",
		Marketplace:   "nunch-skills",
		ManagerPlugin: "nunch-skills-manager",
	}, runner, store, fixedClock{now: time.Now()})

	// When
	_, err := service.Run(context.Background())
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if store.state.PendingNotice == nil || len(store.state.PendingNotice.Dependencies) != 1 {
		t.Fatalf("state = %#v, want one pending dependency", store.state)
	}
	if store.state.PendingNotice.Dependencies[0].Name != "git" {
		t.Fatalf("dependency = %#v, want git", store.state.PendingNotice.Dependencies[0])
	}
}

func Test_ManagerRun_preserves_install_when_marketplace_upgrade_fails(t *testing.T) {
	// Given
	before := []byte(`{"installed":[{` +
		`"pluginId":"deep-interview@nunch-skills",` +
		`"name":"deep-interview",` +
		`"version":"0.1.0",` +
		`"installed":true}]}`)
	runner := &fakeRunner{responses: []commandResponse{{output: before}, {err: errors.New("network unavailable")}}}
	store := &memoryStore{}
	service := New(Config{
		CodexCommand:  "codex",
		Marketplace:   "nunch-skills",
		ManagerPlugin: "nunch-skills-manager",
	}, runner, store, fixedClock{now: time.Now()})

	// When
	_, err := service.Run(context.Background())

	// Then
	if err == nil {
		t.Fatal("Run() error = nil, want error")
	}
	if len(runner.calls) != 2 {
		t.Fatalf("calls = %#v, want no plugin add call", runner.calls)
	}
	if store.state.LastStatus != StatusFailed {
		t.Fatalf("state status = %q, want %q", store.state.LastStatus, StatusFailed)
	}
}
