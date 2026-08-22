package main

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

func sanitizeSkillFrontmatter(root string, fields []string) error {
	if len(fields) == 0 {
		return nil
	}
	return filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fmt.Errorf("walk %s: %w", path, walkErr)
		}
		if entry.IsDir() || entry.Name() != "SKILL.md" {
			return nil
		}
		if err := removeFrontmatterFields(path, fields); err != nil {
			return fmt.Errorf("sanitize %s: %w", path, err)
		}
		return nil
	})
}

func removeFrontmatterFields(path string, fields []string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("read skill: %w", err)
	}
	lines := strings.SplitAfter(string(data), "\n")
	if len(lines) < 2 || strings.TrimSpace(lines[0]) != "---" {
		return fmt.Errorf("missing YAML frontmatter")
	}
	fieldSet := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		fieldSet[field] = struct{}{}
	}

	frontmatterClosed := false
	output := make([]string, 0, len(lines))
	output = append(output, lines[0])
	for _, line := range lines[1:] {
		trimmed := strings.TrimSpace(line)
		if !frontmatterClosed && trimmed == "---" {
			frontmatterClosed = true
			output = append(output, line)
			continue
		}
		if !frontmatterClosed && hasFrontmatterField(line, fieldSet) {
			continue
		}
		output = append(output, line)
	}
	if !frontmatterClosed {
		return fmt.Errorf("unterminated YAML frontmatter")
	}
	return writeFileAtomic(path, []byte(strings.Join(output, "")))
}

func hasFrontmatterField(line string, fields map[string]struct{}) bool {
	if len(line) == 0 || line[0] == ' ' || line[0] == '\t' {
		return false
	}
	name, _, found := strings.Cut(strings.TrimRight(line, "\r\n"), ":")
	if !found {
		return false
	}
	_, exists := fields[name]
	return exists
}
