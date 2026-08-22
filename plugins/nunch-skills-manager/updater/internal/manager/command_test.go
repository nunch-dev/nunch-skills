package manager

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
)

func Test_ExecRunner_returnsStdoutWithoutStderr(t *testing.T) {
	// Given
	t.Setenv("NUNCH_SKILLS_RUNNER_HELPER", "success")

	// When
	output, err := (ExecRunner{}).Run(context.Background(), os.Args[0],
		"-test.run=Test_ExecRunner_helperProcess")
	// Then
	if err != nil {
		t.Fatalf("Run() error = %v", err)
	}
	if string(output) != "{\"ok\":true}\n" {
		t.Fatalf("Run() output = %q, want stdout only", output)
	}
}

func Test_ExecRunner_reportsStderrWhenCommandFails(t *testing.T) {
	// Given
	t.Setenv("NUNCH_SKILLS_RUNNER_HELPER", "failure")

	// When
	_, err := (ExecRunner{}).Run(context.Background(), os.Args[0],
		"-test.run=Test_ExecRunner_helperProcess")

	// Then
	if err == nil || !strings.Contains(err.Error(), "warning from stderr") {
		t.Fatalf("Run() error = %v, want stderr context", err)
	}
}

func Test_ExecRunner_helperProcess(t *testing.T) {
	mode := os.Getenv("NUNCH_SKILLS_RUNNER_HELPER")
	if mode == "" {
		return
	}
	if _, err := fmt.Fprintln(os.Stdout, `{"ok":true}`); err != nil {
		os.Exit(8)
	}
	if _, err := fmt.Fprintln(os.Stderr, "warning from stderr"); err != nil {
		os.Exit(8)
	}
	if mode == "failure" {
		os.Exit(7)
	}
	os.Exit(0)
}
