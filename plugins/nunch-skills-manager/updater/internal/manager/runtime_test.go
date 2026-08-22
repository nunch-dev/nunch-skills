package manager

import (
	"errors"
	"path/filepath"
	"testing"
	"time"
)

func Test_FileStore_Save_then_Load_roundtrips_state(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "state.json")
	store := NewFileStore(path)
	want := State{
		LastCheckedAt: time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC),
		LastStatus:    StatusSuccess,
	}

	// When
	if err := store.Save(want); err != nil {
		t.Fatalf("Save() error = %v", err)
	}
	got, err := store.Load()
	// Then
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !got.LastCheckedAt.Equal(want.LastCheckedAt) || got.LastStatus != want.LastStatus {
		t.Fatalf("Load() = %#v, want %#v", got, want)
	}
}

func Test_AcquireLock_returns_busy_when_existing_lock_is_fresh(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "update.lock")
	now := time.Date(2026, 8, 22, 12, 0, 0, 0, time.UTC)
	first, err := AcquireLock(path, now, 10*time.Minute)
	if err != nil {
		t.Fatalf("AcquireLock() setup error = %v", err)
	}
	defer func() {
		if err := first.Release(); err != nil {
			t.Errorf("Release() error = %v", err)
		}
	}()

	// When
	second, err := AcquireLock(path, now.Add(time.Minute), 10*time.Minute)
	// Then
	if !errors.Is(err, ErrLockBusy) {
		t.Fatalf("AcquireLock() error = %v, want ErrLockBusy", err)
	}
	if second != nil {
		t.Fatal("AcquireLock() returned a lock while busy")
	}
}

func Test_LoadRuntimeConfig_uses_plugin_data_and_default_intervals(t *testing.T) {
	// Given
	values := map[string]string{"PLUGIN_DATA": "/tmp/nunch-data"}
	getenv := func(key string) string { return values[key] }

	// When
	config, err := LoadRuntimeConfig(getenv, "/home/tester")
	// Then
	if err != nil {
		t.Fatalf("LoadRuntimeConfig() error = %v", err)
	}
	if config.StatePath != "/tmp/nunch-data/auto-update.json" || config.SuccessInterval != 24*time.Hour {
		t.Fatalf("LoadRuntimeConfig() = %#v", config)
	}
}
