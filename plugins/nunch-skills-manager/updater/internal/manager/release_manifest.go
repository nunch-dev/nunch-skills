package manager

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
)

const ReleaseManifestPath = "release-manifest.json"

type ReleaseManifest struct {
	SchemaVersion int             `json:"schemaVersion"`
	NPM           ReleaseNPM      `json:"npm"`
	Git           ReleaseGit      `json:"git"`
	Plugins       []ReleasePlugin `json:"plugins"`
	Marketplace   ReleaseFile     `json:"marketplace"`
	Plugin        ReleaseFile     `json:"plugin"`
	Hook          ReleaseFile     `json:"hook"`
	Scripts       []ReleaseFile   `json:"scripts"`
	Binaries      []ReleaseBinary `json:"binaries"`
}

type ReleaseNPM struct {
	Name    string        `json:"name"`
	Version string        `json:"version"`
	Files   []ReleaseFile `json:"files"`
}

type ReleaseGit struct {
	Tag           string `json:"tag"`
	Commit        string `json:"commit"`
	ContentSHA256 string `json:"contentSha256"`
}

type ReleasePlugin struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type ReleaseFile struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type ReleaseBinary struct {
	Platform string `json:"platform"`
	GitPath  string `json:"gitPath"`
	NPMPath  string `json:"npmPath"`
	SHA256   string `json:"sha256"`
}

type ReleaseManifestError struct {
	Field  string
	Reason string
	Cause  error
}

func (err *ReleaseManifestError) Error() string {
	return fmt.Sprintf("release manifest %s: %s", err.Field, err.Reason)
}

func (err *ReleaseManifestError) Unwrap() error {
	return err.Cause
}

func ParseReleaseManifest(data []byte) (ReleaseManifest, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest ReleaseManifest
	if err := decoder.Decode(&manifest); err != nil {
		return ReleaseManifest{}, manifestError("json", "decode failed", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return ReleaseManifest{}, manifestError("json", "must contain one object", err)
	}
	canonical, err := MarshalReleaseManifest(manifest)
	if err != nil {
		return ReleaseManifest{}, err
	}
	if !bytes.Equal(data, canonical) {
		return ReleaseManifest{}, manifestError("json", "bytes are not canonical", nil)
	}
	return manifest, nil
}

func MarshalReleaseManifest(manifest ReleaseManifest) ([]byte, error) {
	canonical := manifest
	canonical.NPM.Files = slices.Clone(manifest.NPM.Files)
	canonical.Plugins = slices.Clone(manifest.Plugins)
	canonical.Scripts = slices.Clone(manifest.Scripts)
	canonical.Binaries = slices.Clone(manifest.Binaries)
	slices.SortFunc(canonical.NPM.Files, compareReleaseFiles)
	slices.SortFunc(canonical.Plugins, func(left, right ReleasePlugin) int {
		return strings.Compare(left.Name, right.Name)
	})
	slices.SortFunc(canonical.Scripts, compareReleaseFiles)
	slices.SortFunc(canonical.Binaries, func(left, right ReleaseBinary) int {
		return strings.Compare(left.Platform, right.Platform)
	})
	if err := validateReleaseManifest(canonical); err != nil {
		return nil, err
	}
	data, err := json.Marshal(canonical)
	if err != nil {
		return nil, manifestError("json", "encode failed", err)
	}
	return append(data, '\n'), nil
}

func SHA256Bytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func compareReleaseFiles(left, right ReleaseFile) int {
	return strings.Compare(left.Path, right.Path)
}

func manifestError(field string, reason string, cause error) error {
	return &ReleaseManifestError{Field: field, Reason: reason, Cause: cause}
}
