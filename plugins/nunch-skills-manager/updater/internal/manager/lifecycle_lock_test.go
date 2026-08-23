package manager

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func Test_AcquireLifecycleLock_returns_busy_to_concurrent_owner(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "lifecycle.lock")
	now := time.Date(2026, 8, 23, 2, 0, 0, 0, time.UTC)
	first, err := AcquireLifecycleLock(path, "install-1", now, 10*time.Minute)
	if err != nil {
		t.Fatalf("AcquireLifecycleLock() setup error = %v", err)
	}
	defer func() {
		if err := first.Release(); err != nil {
			t.Errorf("Release() error = %v", err)
		}
	}()

	// When
	second, err := AcquireLifecycleLock(path, "update-2", now.Add(time.Minute), 10*time.Minute)

	// Then
	if !errors.Is(err, ErrLockBusy) || second != nil {
		t.Fatalf("AcquireLifecycleLock() = %#v, %v; want nil, ErrLockBusy", second, err)
	}
}

func Test_AcquireLifecycleLock_allows_exactly_one_concurrent_writer(t *testing.T) {
	// Given
	const contenders = 8
	path := filepath.Join(t.TempDir(), "lifecycle.lock")
	now := time.Date(2026, 8, 23, 2, 0, 0, 0, time.UTC)
	start := make(chan struct{})
	results := make(chan error, contenders)
	locks := make(chan *LifecycleLock, contenders)
	var group sync.WaitGroup
	for index := range contenders {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			lock, err := AcquireLifecycleLock(path, fmt.Sprintf("owner-%d", index), now, 10*time.Minute)
			results <- err
			locks <- lock
		}()
	}

	// When
	close(start)
	group.Wait()
	close(results)
	close(locks)

	// Then
	successes := 0
	for err := range results {
		if err == nil {
			successes++
			continue
		}
		if !errors.Is(err, ErrLockBusy) {
			t.Fatalf("AcquireLifecycleLock() unexpected error = %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful writers = %d, want 1", successes)
	}
	for lock := range locks {
		if lock != nil {
			if err := lock.Release(); err != nil {
				t.Fatalf("Release() error = %v", err)
			}
		}
	}
}

func Test_LifecycleLock_Release_does_not_remove_replacement_owned_by_another_operation(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "lifecycle.lock")
	now := time.Date(2026, 8, 23, 2, 0, 0, 0, time.UTC)
	stale, err := AcquireLifecycleLock(path, "install-1", now, time.Minute)
	if err != nil {
		t.Fatalf("AcquireLifecycleLock() setup error = %v", err)
	}
	replacement, err := AcquireLifecycleLock(path, "update-2", now.Add(2*time.Minute), time.Minute)
	if err != nil {
		t.Fatalf("AcquireLifecycleLock() replacement error = %v", err)
	}
	defer func() {
		if err := replacement.Release(); err != nil {
			t.Errorf("Release() replacement error = %v", err)
		}
	}()

	// When
	err = stale.Release()

	// Then
	if !errors.Is(err, ErrLockOwnershipLost) {
		t.Fatalf("Release() error = %v, want ErrLockOwnershipLost", err)
	}
	_, err = AcquireLifecycleLock(path, "doctor-3", now.Add(3*time.Minute), 10*time.Minute)
	if !errors.Is(err, ErrLockBusy) {
		t.Fatalf("replacement lock was removed: error = %v", err)
	}
}
