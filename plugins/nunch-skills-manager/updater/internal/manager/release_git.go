package manager

import (
	"context"
	"fmt"
	"strings"
)

type GitCLIContentSource struct {
	root   string
	commit string
	runner Runner
}

func FetchGitRelease(
	ctx context.Context,
	runner Runner,
	remote string,
	root string,
	tag string,
) (*GitCLIContentSource, error) {
	commands := [][]string{
		{"init", "--quiet", root},
		{"-C", root, "remote", "add", "origin", remote},
		{"-C", root, "fetch", "--quiet", "--depth=1", "origin", "refs/tags/" + tag + ":refs/tags/" + tag},
	}
	for _, arguments := range commands {
		if _, err := runner.Run(ctx, "git", arguments...); err != nil {
			return nil, fmt.Errorf("fetch release Git tag %s: %w", tag, err)
		}
	}
	commitBytes, err := runner.Run(ctx, "git", "-C", root, "rev-parse", "--verify", tag+"^{commit}")
	if err != nil {
		return nil, fmt.Errorf("resolve fetched release tag %s: %w", tag, err)
	}
	commit := strings.TrimSpace(string(commitBytes))
	if !hexCommitPattern.MatchString(commit) {
		return nil, verificationError("git", tag, "resolved commit is invalid", nil)
	}
	return &GitCLIContentSource{root: root, commit: commit, runner: runner}, nil
}

func (source *GitCLIContentSource) Commit(context.Context) (string, error) {
	return source.commit, nil
}

func (source *GitCLIContentSource) ResolveTag(ctx context.Context, tag string) (string, error) {
	output, err := source.runner.Run(ctx, "git", "-C", source.root, "rev-parse", "--verify", tag+"^{commit}")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

func (source *GitCLIContentSource) ListFiles(ctx context.Context) ([]string, error) {
	output, err := source.runner.Run(
		ctx, "git", "-C", source.root, "ls-tree", "-r", "-z", "--name-only", source.commit,
	)
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSuffix(string(output), "\x00")
	if trimmed == "" {
		return []string{}, nil
	}
	return strings.Split(trimmed, "\x00"), nil
}

func (source *GitCLIContentSource) ReadFile(ctx context.Context, filePath string) ([]byte, error) {
	if !validReleasePath(filePath) {
		return nil, verificationError("git", filePath, "path is unsafe", nil)
	}
	return source.runner.Run(ctx, "git", "-C", source.root, "show", source.commit+":"+filePath)
}
