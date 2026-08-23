package manager

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const managerHookID = "nunch-skills-manager@nunch-skills:hooks/hooks.json:session_start:0:0"

const (
	oldTrustHash        = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	newTrustHash        = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	unexpectedTrustHash = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
)

func Test_TrustEditor_Upsert_preserves_unrelated_config_bytes(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "config.toml")
	prefix := "model = \"gpt-5.6\"\n# keep this comment\n\n[hooks.state]\n\n"
	other := "[hooks.state.\"other@market:hooks/hooks.json:stop:0:0\"]\n" +
		"trusted_hash = \"sha256:other\"\ncustom = 'keep'\n"
	original := prefix + other
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	editor := NewTrustEditor(path)

	// When
	err := editor.Upsert(managerHookID, "", newTrustHash)
	// Then
	if err != nil {
		t.Fatalf("Upsert() error = %v", err)
	}
	got := readTestFile(t, path)
	if !strings.HasPrefix(got, original) {
		t.Fatalf("unrelated bytes changed:\n%s", got)
	}
	if !strings.Contains(got, "trusted_hash = \""+newTrustHash+"\"") {
		t.Fatalf("manager trust missing:\n%s", got)
	}
	assertMode0600(t, path)
	if backup := readTestFile(t, path+".bak"); backup != original {
		t.Fatalf("backup = %q, want original bytes", backup)
	}
}

func Test_TrustEditor_Upsert_creates_missing_config_safely(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "nested", "config.toml")

	// When
	err := NewTrustEditor(path).Upsert(managerHookID, "", newTrustHash)
	// Then
	if err != nil {
		t.Fatalf("Upsert() error = %v", err)
	}
	if got := readTestFile(t, path); !strings.Contains(got, managerHookID) || !strings.Contains(got, newTrustHash) {
		t.Fatalf("created config missing trust entry: %q", got)
	}
	assertMode0600(t, path)
}

func Test_TrustEditor_Upsert_replaces_only_exact_section_with_compare_and_swap(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "config.toml")
	managerSection := "[hooks.state.\"" + managerHookID + "\"]\ntrusted_hash = \"" + oldTrustHash + "\"\n"
	original := "title = 'same'\n\n" + managerSection + "\n[other]\nvalue = \"unchanged\"\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	err := NewTrustEditor(path).Upsert(managerHookID, oldTrustHash, newTrustHash)
	// Then
	if err != nil {
		t.Fatalf("Upsert() error = %v", err)
	}
	want := strings.Replace(original, oldTrustHash, newTrustHash, 1)
	if got := readTestFile(t, path); got != want {
		t.Fatalf("config bytes = %q, want %q", got, want)
	}
}

func Test_TrustEditor_Remove_preserves_other_hook_entries(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "config.toml")
	managerSection := "[hooks.state.\"" + managerHookID + "\"]\ntrusted_hash = \"" + oldTrustHash + "\"\n\n"
	other := "[hooks.state.\"other@market:hooks/hooks.json:stop:0:0\"]\ntrusted_hash = \"sha256:other\"\n"
	original := "model = 'same'\n\n" + managerSection + other
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	err := NewTrustEditor(path).Remove(managerHookID, oldTrustHash)
	// Then
	if err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	want := strings.Replace(original, managerSection, "", 1)
	if got := readTestFile(t, path); got != want {
		t.Fatalf("config bytes = %q, want %q", got, want)
	}
}

func Test_TrustEditor_Upsert_preserves_original_when_hash_drifted(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "config.toml")
	original := "[hooks.state.\"" + managerHookID + "\"]\ntrusted_hash = \"" + unexpectedTrustHash + "\"\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	err := NewTrustEditor(path).Upsert(managerHookID, oldTrustHash, newTrustHash)

	// Then
	if !errors.Is(err, ErrTrustConflict) {
		t.Fatalf("Upsert() error = %v, want ErrTrustConflict", err)
	}
	if got := readTestFile(t, path); got != original {
		t.Fatalf("config changed on conflict: %q", got)
	}
}

func Test_TrustEditor_Upsert_rejects_malformed_target_without_writing(t *testing.T) {
	// Given
	path := filepath.Join(t.TempDir(), "config.toml")
	original := "[hooks.state.\"" + managerHookID + "\"]\ntrusted_hash = [\"not-a-string\"]\n"
	if err := os.WriteFile(path, []byte(original), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}

	// When
	err := NewTrustEditor(path).Upsert(managerHookID, "", newTrustHash)

	// Then
	if !errors.Is(err, ErrMalformedTrustSection) {
		t.Fatalf("Upsert() error = %v, want ErrMalformedTrustSection", err)
	}
	if got := readTestFile(t, path); got != original {
		t.Fatalf("config changed after malformed input: %q", got)
	}
}

func readTestFile(t *testing.T, path string) string {
	t.Helper()
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%s) error = %v", path, err)
	}
	return string(raw)
}

func assertMode0600(t *testing.T, path string) {
	t.Helper()
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%s) error = %v", path, err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o, want 600", info.Mode().Perm())
	}
}
