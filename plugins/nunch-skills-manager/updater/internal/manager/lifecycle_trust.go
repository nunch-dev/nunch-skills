package manager

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

const ManagerHookTrustID = "nunch-skills-manager@nunch-skills:hooks/hooks.json:session_start:0:0"

const (
	managerHookUnixCommand    = `"${PLUGIN_ROOT}/scripts/run-manager.sh" hook`
	managerHookWindowsCommand = `powershell -NoProfile -ExecutionPolicy Bypass -File ` +
		`"${PLUGIN_ROOT}\scripts\run-manager.ps1" hook`
	managerHookTimeout = 15
)

var ErrManagerHookMismatch = errors.New("manager hook does not match the verified release")

type VerifiedManagerHook struct {
	TrustID   string
	TrustHash string
}

type managerHookFile struct {
	Hooks struct {
		SessionStart []managerHookGroup `json:"SessionStart"`
	} `json:"hooks"`
}

type managerHookGroup struct {
	Matcher string               `json:"matcher"`
	Hooks   []managerHookHandler `json:"hooks"`
}

type managerHookHandler struct {
	Type           string `json:"type"`
	Command        string `json:"command"`
	CommandWindows string `json:"commandWindows"`
	Timeout        int    `json:"timeout"`
	StatusMessage  string `json:"statusMessage"`
}

type hookHashIdentity struct {
	EventName string            `json:"event_name"`
	Hooks     []hookHashHandler `json:"hooks"`
	Matcher   string            `json:"matcher"`
}

type hookHashHandler struct {
	Async         bool   `json:"async"`
	Command       string `json:"command"`
	StatusMessage string `json:"statusMessage,omitempty"`
	Timeout       int    `json:"timeout"`
	Type          string `json:"type"`
}

func VerifyManagerHook(pluginRoot, expectedDigest, operatingSystem string) (VerifiedManagerHook, error) {
	raw, err := os.ReadFile(filepath.Join(pluginRoot, "hooks", "hooks.json"))
	if err != nil {
		return VerifiedManagerHook{}, fmt.Errorf("read manager hook: %w", err)
	}
	if SHA256Bytes(raw) != expectedDigest {
		return VerifiedManagerHook{}, fmt.Errorf("hook digest mismatch: %w", ErrManagerHookMismatch)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var file managerHookFile
	if err := decoder.Decode(&file); err != nil {
		return VerifiedManagerHook{}, fmt.Errorf("decode manager hook: %w", errors.Join(ErrManagerHookMismatch, err))
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return VerifiedManagerHook{}, fmt.Errorf("decode manager hook: %w", errors.Join(ErrManagerHookMismatch, err))
	}
	if len(file.Hooks.SessionStart) != 1 {
		return VerifiedManagerHook{}, ErrManagerHookMismatch
	}
	group := file.Hooks.SessionStart[0]
	if group.Matcher != "^startup$" || len(group.Hooks) != 1 {
		return VerifiedManagerHook{}, ErrManagerHookMismatch
	}
	handler := group.Hooks[0]
	command := handler.Command
	if operatingSystem == "windows" {
		command = handler.CommandWindows
	}
	if handler.Type != "command" ||
		handler.Command != managerHookUnixCommand ||
		handler.CommandWindows != managerHookWindowsCommand ||
		handler.Timeout != managerHookTimeout {
		return VerifiedManagerHook{}, ErrManagerHookMismatch
	}
	identity := hookHashIdentity{
		EventName: "session_start",
		Hooks: []hookHashHandler{{
			Async: false, Command: command, StatusMessage: handler.StatusMessage,
			Timeout: handler.Timeout, Type: "command",
		}},
		Matcher: group.Matcher,
	}
	canonical, err := json.Marshal(identity)
	if err != nil {
		return VerifiedManagerHook{}, fmt.Errorf("encode hook trust identity: %w", err)
	}
	digest := sha256.Sum256(canonical)
	return VerifiedManagerHook{
		TrustID: ManagerHookTrustID, TrustHash: "sha256:" + hex.EncodeToString(digest[:]),
	}, nil
}

func InspectTrustHash(configPath, id string) (string, bool, error) {
	raw, err := readConfig(configPath)
	if err != nil {
		return "", false, err
	}
	section, found, err := findTrustSection(raw, id)
	if err != nil {
		return "", false, err
	}
	return section.hash, found, nil
}
