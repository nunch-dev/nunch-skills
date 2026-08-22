package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
)

func replacePath(source, destination string) error {
	parent := filepath.Dir(destination)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return fmt.Errorf("create destination parent: %w", err)
	}
	stage, err := os.MkdirTemp(parent, ".upstream-sync-")
	if err != nil {
		return fmt.Errorf("create destination stage: %w", err)
	}
	defer func() { _ = os.RemoveAll(stage) }()

	candidate := filepath.Join(stage, "candidate")
	if err := copyTree(source, candidate); err != nil {
		return err
	}
	backup := filepath.Join(stage, "backup")
	hadDestination := true
	if err := os.Rename(destination, backup); err != nil {
		if !errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("back up destination: %w", err)
		}
		hadDestination = false
	}
	if err := os.Rename(candidate, destination); err != nil {
		if hadDestination {
			_ = os.Rename(backup, destination)
		}
		return fmt.Errorf("activate destination: %w", err)
	}
	return nil
}

func copyTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk source %s: %w", path, walkErr)
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return fmt.Errorf("resolve source path %s: %w", path, err)
		}
		target := destination
		if relative != "." {
			target = filepath.Join(destination, relative)
		}
		info, err := entry.Info()
		if err != nil {
			return fmt.Errorf("inspect source %s: %w", path, err)
		}
		switch {
		case info.Mode().IsDir():
			if err := os.MkdirAll(target, info.Mode().Perm()); err != nil {
				return fmt.Errorf("create directory %s: %w", target, err)
			}
		case info.Mode().IsRegular():
			if err := copyFile(path, target, info.Mode().Perm()); err != nil {
				return err
			}
		case info.Mode()&os.ModeSymlink != 0:
			link, err := os.Readlink(path)
			if err != nil {
				return fmt.Errorf("read symlink %s: %w", path, err)
			}
			if err := os.Symlink(link, target); err != nil {
				return fmt.Errorf("copy symlink %s: %w", path, err)
			}
		default:
			return fmt.Errorf("unsupported source file mode %s: %s", path, info.Mode())
		}
		return nil
	})
}

func copyFile(source, destination string, mode fs.FileMode) (err error) {
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open source file %s: %w", source, err)
	}
	defer func() { err = errors.Join(err, input.Close()) }()
	output, err := os.OpenFile(destination, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return fmt.Errorf("create destination file %s: %w", destination, err)
	}
	defer func() { err = errors.Join(err, output.Close()) }()
	if _, err := io.Copy(output, input); err != nil {
		return fmt.Errorf("copy file %s: %w", source, err)
	}
	return nil
}

func writeJSONAtomic(path string, value lockFile) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("encode lock file: %w", err)
	}
	data = append(data, '\n')
	return writeFileAtomic(path, data)
}

func writeFileAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create parent for %s: %w", path, err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), ".upstream-sync-")
	if err != nil {
		return fmt.Errorf("create temporary file for %s: %w", path, err)
	}
	tempPath := file.Name()
	defer func() { _ = os.Remove(tempPath) }()
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return fmt.Errorf("write temporary file for %s: %w", path, err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close temporary file for %s: %w", path, err)
	}
	mode := fs.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("inspect mode for %s: %w", path, err)
	}
	if err := os.Chmod(tempPath, mode); err != nil {
		return fmt.Errorf("set mode for %s: %w", path, err)
	}
	if err := os.Rename(tempPath, path); err != nil {
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}
