package manager

import "fmt"

func validateLifecycleState(state LifecycleState) error {
	seen := make(map[string]struct{}, len(state.Resources))
	for _, resource := range state.Resources {
		if err := validateOwnedResource(resource); err != nil {
			return err
		}
		key := string(resource.Kind) + "\x00" + resource.Name
		if _, exists := seen[key]; exists {
			return fmt.Errorf("duplicate resource %s/%s: %w", resource.Kind, resource.Name, ErrInvalidLifecycleState)
		}
		seen[key] = struct{}{}
	}
	if operation := state.Operation; operation != nil {
		if operation.ID == "" ||
			!validOperationKind(operation.Kind) ||
			!validOperationPhase(operation.Phase) ||
			operation.StartedAt.IsZero() {
			return fmt.Errorf("invalid operation: %w", ErrInvalidLifecycleState)
		}
		if err := validateOperationCreatedResources(*operation, state.Resources); err != nil {
			return err
		}
	}
	if release := state.LastKnownGood; release != nil && (release.Version == "" || release.Commit == "") {
		return fmt.Errorf("invalid last-known-good release: %w", ErrInvalidLifecycleState)
	}
	return nil
}

func validateOperationCreatedResources(operation LifecycleOperation, resources []OwnedResource) error {
	if len(operation.CreatedResources) > 0 && operation.Kind != OperationInstall {
		return fmt.Errorf("non-install operation has created resources: %w", ErrInvalidLifecycleState)
	}
	seen := make(map[string]struct{}, len(operation.CreatedResources))
	for _, resource := range operation.CreatedResources {
		if err := validateOwnedResource(resource); err != nil || resource.Ownership != OwnershipCreated {
			return fmt.Errorf("invalid operation created resource: %w", ErrInvalidLifecycleState)
		}
		key := string(resource.Kind) + "\x00" + resource.Name
		orphaned := resourceIndex(resources, resource.Kind, resource.Name) < 0
		if _, found := seen[key]; found || orphaned && operation.Phase != PhaseRollback {
			return fmt.Errorf("orphan operation created resource: %w", ErrInvalidLifecycleState)
		}
		seen[key] = struct{}{}
	}
	return nil
}

func validateOwnedResource(resource OwnedResource) error {
	if resource.Name == "" || !validResourceKind(resource.Kind) || !validOwnership(resource.Ownership) {
		return fmt.Errorf("invalid resource: %w", ErrInvalidLifecycleState)
	}
	if resource.Ownership != OwnershipCreated && resource.PreStateFingerprint == "" {
		return fmt.Errorf(
			"resource %s/%s has no pre-state fingerprint: %w",
			resource.Kind,
			resource.Name,
			ErrInvalidLifecycleState,
		)
	}
	return nil
}

func validResourceKind(kind ResourceKind) bool {
	switch kind {
	case ResourceMarketplace, ResourcePlugin, ResourceTrust, ResourceData:
		return true
	default:
		return false
	}
}

func validOwnership(ownership Ownership) bool {
	switch ownership {
	case OwnershipCreated, OwnershipAdopted, OwnershipPreExisting:
		return true
	default:
		return false
	}
}

func validOperationKind(kind OperationKind) bool {
	switch kind {
	case OperationInstall, OperationUpdate, OperationUninstall:
		return true
	default:
		return false
	}
}

func validOperationPhase(phase OperationPhase) bool {
	switch phase {
	case PhasePrepared, PhasePlugins, PhaseTrust, PhaseVerify, PhaseRollback:
		return true
	default:
		return false
	}
}

func validOwnershipTransition(previous, next Ownership) bool {
	switch previous {
	case OwnershipCreated:
		return next == OwnershipCreated
	case OwnershipAdopted:
		return next == OwnershipAdopted
	case OwnershipPreExisting:
		return next == OwnershipPreExisting || next == OwnershipAdopted
	default:
		return false
	}
}

func validPhaseTransition(previous, next OperationPhase) bool {
	switch previous {
	case PhasePrepared:
		return next == PhasePlugins || next == PhaseRollback
	case PhasePlugins:
		return next == PhaseTrust || next == PhaseRollback
	case PhaseTrust:
		return next == PhaseVerify || next == PhaseRollback
	case PhaseVerify:
		return next == PhaseRollback
	case PhaseRollback:
		return false
	default:
		return false
	}
}
