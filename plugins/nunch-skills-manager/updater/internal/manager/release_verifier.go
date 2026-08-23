package manager

import (
	"bytes"
	"context"
	"fmt"
	"slices"
)

type GitContentSource interface {
	Commit(ctx context.Context) (string, error)
	ResolveTag(ctx context.Context, tag string) (string, error)
	ListFiles(ctx context.Context) ([]string, error)
	ReadFile(ctx context.Context, path string) ([]byte, error)
}

type VerifiedRelease struct {
	Package string
	Version string
	Commit  string
}

type ReleaseVerificationError struct {
	Source string
	Path   string
	Reason string
	Cause  error
}

func (err *ReleaseVerificationError) Error() string {
	if err.Path == "" {
		return fmt.Sprintf("verify release %s: %s", err.Source, err.Reason)
	}
	return fmt.Sprintf("verify release %s %s: %s", err.Source, err.Path, err.Reason)
}

func (err *ReleaseVerificationError) Unwrap() error {
	return err.Cause
}

func VerifyRelease(
	ctx context.Context,
	manifest ReleaseManifest,
	npm NPMRelease,
	git GitContentSource,
) (VerifiedRelease, error) {
	canonical, err := MarshalReleaseManifest(manifest)
	if err != nil {
		return VerifiedRelease{}, err
	}
	if !bytes.Equal(canonical, npm.ManifestBytes) {
		return VerifiedRelease{}, verificationError("npm", ReleaseManifestPath, "manifest bytes differ", nil)
	}
	if err := verifyNPMFiles(manifest, npm.Files); err != nil {
		return VerifiedRelease{}, err
	}
	if err := verifyGitIdentity(ctx, manifest.Git, git); err != nil {
		return VerifiedRelease{}, err
	}
	gitFiles, err := readGitTree(ctx, git)
	if err != nil {
		return VerifiedRelease{}, err
	}
	contentDigest, err := GitTreeSHA256(gitFiles)
	if err != nil {
		return VerifiedRelease{}, verificationError("git", "", "content digest failed", err)
	}
	if contentDigest != manifest.Git.ContentSHA256 {
		return VerifiedRelease{}, verificationError("git", "", "content digest mismatch", nil)
	}
	if err := verifyProtectedGitFiles(manifest, gitFiles); err != nil {
		return VerifiedRelease{}, err
	}
	return VerifiedRelease{Package: manifest.NPM.Name, Version: manifest.NPM.Version, Commit: manifest.Git.Commit}, nil
}

func verifyNPMFiles(manifest ReleaseManifest, files map[string][]byte) error {
	expected := make(map[string]string, len(manifest.NPM.Files)+len(manifest.Binaries)+1)
	expected[ReleaseManifestPath] = SHA256Bytes(files[ReleaseManifestPath])
	for _, file := range manifest.NPM.Files {
		if err := addExpectedDigest(expected, file.Path, file.SHA256); err != nil {
			return err
		}
	}
	for _, binary := range manifest.Binaries {
		if err := addExpectedDigest(expected, binary.NPMPath, binary.SHA256); err != nil {
			return err
		}
	}
	if len(files) != len(expected) {
		return verificationError("npm", "", "tarball file allowlist mismatch", nil)
	}
	for filePath, digest := range expected {
		data, found := files[filePath]
		if !found {
			return verificationError("npm", filePath, "file is missing", nil)
		}
		if filePath != ReleaseManifestPath && SHA256Bytes(data) != digest {
			return verificationError("npm", filePath, "digest mismatch", nil)
		}
	}
	return nil
}

func verifyGitIdentity(ctx context.Context, expected ReleaseGit, source GitContentSource) error {
	commit, err := source.Commit(ctx)
	if err != nil {
		return verificationError("git", "", "read commit failed", err)
	}
	if commit != expected.Commit {
		return verificationError("git", "", "commit mismatch", nil)
	}
	target, err := source.ResolveTag(ctx, expected.Tag)
	if err != nil {
		return verificationError("git", expected.Tag, "resolve tag failed", err)
	}
	if target != expected.Commit {
		return verificationError("git", expected.Tag, "tag target mismatch", nil)
	}
	return nil
}

func readGitTree(ctx context.Context, source GitContentSource) (map[string][]byte, error) {
	paths, err := source.ListFiles(ctx)
	if err != nil {
		return nil, verificationError("git", "", "list files failed", err)
	}
	slices.Sort(paths)
	files := make(map[string][]byte, len(paths))
	for _, filePath := range paths {
		if !validReleasePath(filePath) {
			return nil, verificationError("git", filePath, "path is unsafe", nil)
		}
		if _, found := files[filePath]; found {
			return nil, verificationError("git", filePath, "duplicate path", nil)
		}
		data, readErr := source.ReadFile(ctx, filePath)
		if readErr != nil {
			return nil, verificationError("git", filePath, "read failed", readErr)
		}
		files[filePath] = data
	}
	return files, nil
}

func verifyProtectedGitFiles(manifest ReleaseManifest, files map[string][]byte) error {
	protected := make([]ReleaseFile, 0, 3+len(manifest.Scripts)+len(manifest.Binaries))
	protected = append(protected, manifest.Marketplace, manifest.Plugin, manifest.Hook)
	protected = append(protected, manifest.Scripts...)
	for _, binary := range manifest.Binaries {
		protected = append(protected, ReleaseFile{Path: binary.GitPath, SHA256: binary.SHA256})
	}
	for _, file := range protected {
		data, found := files[file.Path]
		if !found {
			return verificationError("git", file.Path, "protected file is missing", nil)
		}
		if SHA256Bytes(data) != file.SHA256 {
			return verificationError("git", file.Path, "protected file digest mismatch", nil)
		}
	}
	return nil
}

func addExpectedDigest(expected map[string]string, filePath string, digest string) error {
	if _, found := expected[filePath]; found {
		return verificationError("npm", filePath, "duplicate allowlist path", nil)
	}
	expected[filePath] = digest
	return nil
}

func verificationError(source string, filePath string, reason string, cause error) error {
	return &ReleaseVerificationError{Source: source, Path: filePath, Reason: reason, Cause: cause}
}
