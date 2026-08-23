package manager

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

var ErrUnsafeFile = errors.New("unsafe file target")

func writeFileAtomic(path string, data []byte) (err error) {
	directory := filepath.Dir(path)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create parent directory: %w", err)
	}
	if info, statErr := os.Lstat(path); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s is a symlink: %w", path, ErrUnsafeFile)
	} else if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return fmt.Errorf("inspect target: %w", statErr)
	}
	temporaryPath, err := createSyncedTemporary(directory, data)
	if err != nil {
		return err
	}
	defer func() {
		removeErr := os.Remove(temporaryPath)
		if removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			err = errors.Join(err, removeErr)
		}
	}()
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace target: %w", err)
	}
	if err := os.Chmod(path, 0o600); err != nil {
		return fmt.Errorf("set target permissions: %w", err)
	}
	return syncDirectory(directory)
}

func createSyncedTemporary(directory string, data []byte) (path string, err error) {
	temporary, err := os.CreateTemp(directory, ".nunch-skills-*.tmp")
	if err != nil {
		return "", fmt.Errorf("create temporary file: %w", err)
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, temporary.Close(), os.Remove(temporary.Name()))
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return "", fmt.Errorf("set temporary permissions: %w", err)
	}
	if _, err := temporary.Write(data); err != nil {
		return "", fmt.Errorf("write temporary file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return "", fmt.Errorf("sync temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return "", fmt.Errorf("close temporary file: %w", err)
	}
	return temporary.Name(), nil
}

func syncDirectory(path string) (err error) {
	directory, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open parent directory: %w", err)
	}
	defer func() { err = errors.Join(err, directory.Close()) }()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync parent directory: %w", err)
	}
	return nil
}
