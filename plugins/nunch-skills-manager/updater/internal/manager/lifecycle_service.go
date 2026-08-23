package manager

import (
	"context"
	"errors"
	"fmt"
	"time"
)

var ErrConfirmationRequired = errors.New("uninstall confirmation is required")

type LifecycleBackend interface {
	Marketplace(ctx context.Context) (bool, error)
	PinMarketplace(ctx context.Context, commit string) error
	Plugins(ctx context.Context) (PluginList, error)
	Install(ctx context.Context, name string) error
	TrustIntent(ctx context.Context, manifest ReleaseManifest) (Ownership, string, error)
	Trust(ctx context.Context, manifest ReleaseManifest, expected Ownership, expectedHash string) error
	RemovePlugin(ctx context.Context, id string) error
	RemoveTrust(ctx context.Context, expectedHash string) error
	RemoveMarketplace(ctx context.Context) error
}

type LifecycleServiceConfig struct {
	Backend        LifecycleBackend
	Store          *LifecycleStore
	LockPath       string
	LockStaleAfter time.Duration
	Clock          Clock
	Manifest       ReleaseManifest
	ManagerName    string
	Marketplace    string
}

type LifecycleResult struct {
	Command LifecycleCommandKind
	Targets []string
	DryRun  bool
}

type LifecycleService struct{ config LifecycleServiceConfig }

func NewLifecycleService(config LifecycleServiceConfig) *LifecycleService {
	return &LifecycleService{config: config}
}

func (service *LifecycleService) Execute(
	ctx context.Context,
	command LifecycleCommand,
) (LifecycleResult, error) {
	switch command.Kind {
	case LifecycleInstall:
		return service.install(ctx, command)
	case LifecycleUninstall:
		return service.uninstall(ctx, command)
	case LifecycleUpdate:
		return LifecycleResult{}, fmt.Errorf(
			"foreground update requires verified release discovery: %w",
			ErrInvalidLifecycleCommand,
		)
	case LifecycleDoctor:
		return LifecycleResult{Command: LifecycleDoctor, DryRun: command.DryRun}, nil
	default:
		return LifecycleResult{}, ErrInvalidLifecycleCommand
	}
}

func (service *LifecycleService) begin(kind OperationKind) (*LifecycleLock, LifecycleState, error) {
	now := service.config.Clock.Now()
	owner := fmt.Sprintf("%s-%d", kind, now.UnixNano())
	lock, err := AcquireLifecycleLock(service.config.LockPath, owner, now, service.config.LockStaleAfter)
	if err != nil {
		return nil, LifecycleState{}, err
	}
	state, err := service.config.Store.Load()
	if err != nil {
		if releaseErr := lock.Release(); releaseErr != nil {
			err = errors.Join(err, releaseErr)
		}
		return nil, LifecycleState{}, err
	}
	state, err = BeginLifecycleOperation(state, LifecycleOperation{
		ID: owner, Kind: kind, Phase: PhasePrepared, StartedAt: now,
	})
	if err != nil {
		if releaseErr := lock.Release(); releaseErr != nil {
			err = errors.Join(err, releaseErr)
		}
		return nil, LifecycleState{}, err
	}
	if err := service.config.Store.Save(state); err != nil {
		if releaseErr := lock.Release(); releaseErr != nil {
			err = errors.Join(err, releaseErr)
		}
		return nil, LifecycleState{}, err
	}
	return lock, state, nil
}

func (service *LifecycleService) advance(state LifecycleState, phase OperationPhase) (LifecycleState, error) {
	next, err := AdvanceLifecycleOperation(state, phase)
	if err != nil {
		return LifecycleState{}, err
	}
	if err := service.config.Store.Save(next); err != nil {
		return LifecycleState{}, err
	}
	return next, nil
}
