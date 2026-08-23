package manager

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

var (
	ErrLockOwnershipLost          = errors.New("lock ownership was lost")
	ErrInvalidLifecycleLock       = errors.New("invalid lifecycle lock")
	ErrInvalidLifecycleLockRecord = errors.New("invalid lifecycle lock record")
)

type lifecycleLockRecord struct {
	Owner      string    `json:"owner"`
	AcquiredAt time.Time `json:"acquiredAt"`
}

type LifecycleLock struct {
	path  string
	owner string
}

func AcquireLifecycleLock(path, owner string, now time.Time, staleAfter time.Duration) (*LifecycleLock, error) {
	if owner == "" || staleAfter < 0 {
		return nil, ErrInvalidLifecycleLock
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create lifecycle lock directory: %w", err)
	}
	lock, err := createLifecycleLock(path, owner, now)
	if err == nil || !errors.Is(err, os.ErrExist) {
		return lock, err
	}
	record, err := readLifecycleLock(path)
	if err != nil {
		return nil, fmt.Errorf("existing lifecycle lock is not readable: %w", errors.Join(ErrLockBusy, err))
	}
	if now.Sub(record.AcquiredAt) < staleAfter {
		return nil, ErrLockBusy
	}
	stalePath := fmt.Sprintf("%s.stale.%s", path, owner)
	if err := os.Rename(path, stalePath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrLockBusy
		}
		return nil, fmt.Errorf("quarantine stale lifecycle lock: %w", err)
	}
	defer func() {
		if removeErr := os.Remove(stalePath); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			return
		}
	}()
	lock, err = createLifecycleLock(path, owner, now)
	if errors.Is(err, os.ErrExist) {
		return nil, ErrLockBusy
	}
	return lock, err
}

func createLifecycleLock(path, owner string, now time.Time) (*LifecycleLock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create lifecycle lock: %w", err)
	}
	record := lifecycleLockRecord{Owner: owner, AcquiredAt: now.UTC()}
	encodeErr := json.NewEncoder(file).Encode(record)
	syncErr := file.Sync()
	closeErr := file.Close()
	if err := errors.Join(encodeErr, syncErr, closeErr); err != nil {
		removeErr := os.Remove(path)
		return nil, errors.Join(fmt.Errorf("persist lifecycle lock: %w", err), removeErr)
	}
	return &LifecycleLock{path: path, owner: owner}, nil
}

func readLifecycleLock(path string) (lifecycleLockRecord, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return lifecycleLockRecord{}, fmt.Errorf("read lifecycle lock: %w", err)
	}
	var record lifecycleLockRecord
	if err := json.Unmarshal(raw, &record); err != nil {
		return lifecycleLockRecord{}, fmt.Errorf("decode lifecycle lock: %w", err)
	}
	if record.Owner == "" || record.AcquiredAt.IsZero() {
		return lifecycleLockRecord{}, ErrInvalidLifecycleLockRecord
	}
	return record, nil
}

func (lock *LifecycleLock) Release() error {
	record, err := readLifecycleLock(lock.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if record.Owner != lock.owner {
		return ErrLockOwnershipLost
	}
	if err := os.Remove(lock.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("release lifecycle lock: %w", err)
	}
	return nil
}
