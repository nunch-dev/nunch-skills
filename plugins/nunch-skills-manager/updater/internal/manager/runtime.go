package manager

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	defaultMarketplace    = "nunch-skills"
	defaultManagerPlugin  = "nunch-skills-manager"
	defaultCheckInterval  = 24 * time.Hour
	defaultRetryInterval  = 30 * time.Minute
	defaultLockStaleAfter = 10 * time.Minute
	defaultCommandTimeout = 2 * time.Minute
)

var ErrLockBusy = errors.New("updater lock is busy")

type RuntimeConfig struct {
	Manager         Config
	StatePath       string
	LockPath        string
	SuccessInterval time.Duration
	RetryInterval   time.Duration
	LockStaleAfter  time.Duration
	CommandTimeout  time.Duration
	Disabled        bool
}

type ConfigError struct {
	Field  string
	Reason string
}

func (err *ConfigError) Error() string {
	return fmt.Sprintf("invalid %s: %s", err.Field, err.Reason)
}

func LoadRuntimeConfig(getenv func(string) string, home string) (RuntimeConfig, error) {
	dataDir := getenv("NUNCH_SKILLS_MANAGER_DATA")
	if dataDir == "" {
		dataDir = getenv("PLUGIN_DATA")
	}
	if dataDir == "" {
		codexHome := getenv("CODEX_HOME")
		if codexHome == "" {
			codexHome = filepath.Join(home, ".codex")
		}
		dataDir = filepath.Join(codexHome, "plugins", "data", defaultManagerPlugin)
	}
	successInterval, err := durationFromEnv(getenv, "NUNCH_SKILLS_AUTO_UPDATE_INTERVAL", defaultCheckInterval)
	if err != nil {
		return RuntimeConfig{}, err
	}
	retryInterval, err := durationFromEnv(getenv, "NUNCH_SKILLS_AUTO_UPDATE_RETRY_INTERVAL", defaultRetryInterval)
	if err != nil {
		return RuntimeConfig{}, err
	}
	commandTimeout, err := durationFromEnv(getenv, "NUNCH_SKILLS_AUTO_UPDATE_TIMEOUT", defaultCommandTimeout)
	if err != nil {
		return RuntimeConfig{}, err
	}
	command := getenv("NUNCH_SKILLS_CODEX_COMMAND")
	if command == "" {
		command = "codex"
	}
	return RuntimeConfig{
		Manager: Config{
			CodexCommand:  command,
			Marketplace:   defaultMarketplace,
			ManagerPlugin: defaultManagerPlugin,
		},
		StatePath:       filepath.Join(dataDir, "auto-update.json"),
		LockPath:        filepath.Join(dataDir, "auto-update.lock"),
		SuccessInterval: successInterval,
		RetryInterval:   retryInterval,
		LockStaleAfter:  defaultLockStaleAfter,
		CommandTimeout:  commandTimeout,
		Disabled:        getenv("NUNCH_SKILLS_AUTO_UPDATE_DISABLED") == "1",
	}, nil
}

func durationFromEnv(getenv func(string) string, key string, fallback time.Duration) (time.Duration, error) {
	raw := getenv(key)
	if raw == "" {
		return fallback, nil
	}
	duration, err := time.ParseDuration(raw)
	if err != nil || duration < 0 {
		return 0, &ConfigError{Field: key, Reason: "must be a non-negative Go duration"}
	}
	return duration, nil
}

type FileStore struct {
	path string
}

func NewFileStore(path string) *FileStore {
	return &FileStore{path: path}
}

func (store *FileStore) Load() (State, error) {
	raw, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return State{}, nil
	}
	if err != nil {
		return State{}, fmt.Errorf("read state: %w", err)
	}
	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		return State{}, fmt.Errorf("decode state: %w", err)
	}
	return state, nil
}

func (store *FileStore) Save(state State) error {
	if err := os.MkdirAll(filepath.Dir(store.path), 0o700); err != nil {
		return fmt.Errorf("create state directory: %w", err)
	}
	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode state: %w", err)
	}
	temporary := fmt.Sprintf("%s.%d.tmp", store.path, os.Getpid())
	if err := os.WriteFile(temporary, append(raw, '\n'), 0o600); err != nil {
		return fmt.Errorf("write temporary state: %w", err)
	}
	if err := os.Rename(temporary, store.path); err != nil {
		return fmt.Errorf("replace state: %w", err)
	}
	return nil
}

type Lock struct {
	path string
}

func AdoptLock(path string) *Lock {
	return &Lock{path: path}
}

func AcquireLock(path string, now time.Time, staleAfter time.Duration) (*Lock, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create lock directory: %w", err)
	}
	lock, err := createLock(path, now)
	if err == nil || !errors.Is(err, os.ErrExist) {
		return lock, err
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read lock: %w", err)
	}
	lockedAtMillis, err := strconv.ParseInt(strings.TrimSpace(string(raw)), 10, 64)
	if err != nil {
		return nil, fmt.Errorf("parse lock timestamp: %w", err)
	}
	if now.Sub(time.UnixMilli(lockedAtMillis)) < staleAfter {
		return nil, ErrLockBusy
	}
	if err := os.Remove(path); err != nil {
		return nil, fmt.Errorf("remove stale lock: %w", err)
	}
	lock, err = createLock(path, now)
	if errors.Is(err, os.ErrExist) {
		return nil, ErrLockBusy
	}
	return lock, err
}

func createLock(path string, now time.Time) (*Lock, error) {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create lock: %w", err)
	}
	if _, writeErr := fmt.Fprintln(file, now.UnixMilli()); writeErr != nil {
		closeErr := file.Close()
		return nil, errors.Join(fmt.Errorf("write lock: %w", writeErr), closeErr)
	}
	if err := file.Close(); err != nil {
		return nil, fmt.Errorf("close lock: %w", err)
	}
	return &Lock{path: path}, nil
}

func (lock *Lock) Release() error {
	if err := os.Remove(lock.path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("release lock: %w", err)
	}
	return nil
}

type SystemClock struct{}

func (SystemClock) Now() time.Time {
	return time.Now().UTC()
}
