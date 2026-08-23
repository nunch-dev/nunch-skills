package manager

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
)

var (
	ErrTrustConflict         = errors.New("hook trust compare-and-swap conflict")
	ErrMalformedTrustSection = errors.New("malformed hook trust section")
	ErrInvalidTrustID        = errors.New("invalid hook trust identifier")
	ErrInvalidTrustHash      = errors.New("invalid hook trust hash")
)

var (
	trustHashLine = regexp.MustCompile(
		`(?m)^([ \t]*trusted_hash[ \t]*=[ \t]*")(sha256:[0-9a-f]+)("[ \t]*(?:#[^\r\n]*)?\r?$)`,
	)
	validTrustHash = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
)

type TrustEditor struct{ path string }

type trustSection struct {
	start int
	end   int
	hash  string
}

func NewTrustEditor(path string) *TrustEditor { return &TrustEditor{path: path} }

func (editor *TrustEditor) Upsert(id, expectedHash, newHash string) error {
	if err := validateTrustInputs(id, newHash); err != nil {
		return err
	}
	original, err := readConfig(editor.path)
	if err != nil {
		return err
	}
	section, found, err := findTrustSection(original, id)
	if err != nil {
		return err
	}
	updated, err := updatedTrustConfig(original, id, expectedHash, newHash, section, found)
	if err != nil {
		return err
	}
	return editor.persist(original, updated)
}

func (editor *TrustEditor) Remove(id, expectedHash string) error {
	if err := validateTrustInputs(id, expectedHash); err != nil {
		return err
	}
	original, err := readConfig(editor.path)
	if err != nil {
		return err
	}
	section, found, err := findTrustSection(original, id)
	if err != nil {
		return err
	}
	if !found || section.hash != expectedHash {
		return ErrTrustConflict
	}
	updated := joinConfigParts(original[:section.start], original[section.end:])
	return editor.persist(original, updated)
}

func (editor *TrustEditor) persist(original, updated []byte) error {
	if bytes.Equal(original, updated) {
		return nil
	}
	if err := writeFileAtomic(editor.path+".bak", original); err != nil {
		return fmt.Errorf("backup Codex config: %w", err)
	}
	if err := writeFileAtomic(editor.path, updated); err != nil {
		return fmt.Errorf("update Codex config: %w", err)
	}
	return nil
}

func readConfig(path string) ([]byte, error) {
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return []byte{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("inspect Codex config: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return nil, fmt.Errorf("codex config target: %w", ErrUnsafeFile)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read Codex config: %w", err)
	}
	return raw, nil
}

func validateTrustInputs(id, hash string) error {
	if id == "" || strings.ContainsAny(id, "\"\r\n") {
		return ErrInvalidTrustID
	}
	if !validTrustHash.MatchString(hash) {
		return ErrInvalidTrustHash
	}
	return nil
}

func updatedTrustConfig(
	original []byte,
	id, expectedHash, newHash string,
	section trustSection,
	found bool,
) ([]byte, error) {
	if found {
		if section.hash != expectedHash {
			return nil, ErrTrustConflict
		}
		body := original[section.start:section.end]
		updatedBody := trustHashLine.ReplaceAll(body, []byte("${1}"+newHash+"${3}"))
		return joinConfigParts(original[:section.start], updatedBody, original[section.end:]), nil
	}
	if expectedHash != "" {
		return nil, ErrTrustConflict
	}
	separator := ""
	if len(original) > 0 && original[len(original)-1] != '\n' {
		separator = "\n"
	}
	sectionBytes := fmt.Sprintf("%s\n[hooks.state.\"%s\"]\ntrusted_hash = \"%s\"\n", separator, id, newHash)
	return append(append([]byte(nil), original...), sectionBytes...), nil
}

func joinConfigParts(parts ...[]byte) []byte {
	return bytes.Join(parts, nil)
}
