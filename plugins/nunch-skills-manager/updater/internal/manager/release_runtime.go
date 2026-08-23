package manager

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
)

type ProductionAutoRelease struct {
	Updater *AutoReleaseUpdater
	Source  *ProductionReleaseSource
}

func NewProductionAutoRelease(
	config RuntimeConfig,
	codexHome string,
	getenv func(string) string,
) (*ProductionAutoRelease, error) {
	registryURL := getenv("NUNCH_SKILLS_NPM_REGISTRY")
	if registryURL == "" {
		registryURL = defaultNPMRegistry
	}
	gitRemote := getenv("NUNCH_SKILLS_GIT_REMOTE")
	if gitRemote == "" {
		gitRemote = defaultGitRemote
	}
	registry, err := NewNPMRegistryClient(registryURL, &http.Client{Timeout: config.CommandTimeout})
	if err != nil {
		return nil, fmt.Errorf("configure npm release source: %w", err)
	}
	paths := NewLifecyclePaths(codexHome)
	runner := ExecRunner{}
	source := NewProductionReleaseSource(ProductionReleaseSourceConfig{
		Registry: registry, GitRunner: runner, Codex: config.Manager, CodexRun: runner,
		GitRemote: gitRemote, TempParent: os.TempDir(),
	})
	mutator := NewProductionAutoReleaseMutator(
		config.Manager,
		runner,
		filepath.Join(codexHome, "config.toml"),
		filepath.Join(paths.Root, "snapshots"),
	)
	updater := NewAutoReleaseUpdater(AutoReleaseConfig{
		LockPath: paths.Lock, LockStaleAfter: config.LockStaleAfter,
	}, NewLifecycleStore(paths.State), SystemClock{}, source, mutator)
	return &ProductionAutoRelease{Updater: updater, Source: source}, nil
}
