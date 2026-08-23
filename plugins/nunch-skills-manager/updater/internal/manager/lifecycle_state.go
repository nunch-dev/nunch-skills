package manager

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const LifecycleSchemaVersion = 1

var (
	ErrUnsupportedLifecycleSchema = errors.New("unsupported lifecycle schema")
	ErrInvalidLifecycleState      = errors.New("invalid lifecycle state")
	ErrOwnershipPromotion         = errors.New("ownership promotion is not allowed")
	ErrOwnershipTransition        = errors.New("ownership transition is not allowed")
	ErrInvalidOperationTransition = errors.New("operation transition is not allowed")
)

type ResourceKind string

const (
	ResourceMarketplace ResourceKind = "marketplace"
	ResourcePlugin      ResourceKind = "plugin"
	ResourceTrust       ResourceKind = "trust"
	ResourceData        ResourceKind = "data"
)

type Ownership string

const (
	OwnershipCreated     Ownership = "created"
	OwnershipAdopted     Ownership = "adopted"
	OwnershipPreExisting Ownership = "pre-existing"
)

type OperationKind string

const (
	OperationInstall   OperationKind = "install"
	OperationUpdate    OperationKind = "update"
	OperationUninstall OperationKind = "uninstall"
)

type OperationPhase string

const (
	PhasePrepared OperationPhase = "prepared"
	PhasePlugins  OperationPhase = "plugins"
	PhaseTrust    OperationPhase = "trust"
	PhaseVerify   OperationPhase = "verify"
	PhaseRollback OperationPhase = "rollback"
)

type OwnedResource struct {
	Kind                ResourceKind `json:"kind"`
	Name                string       `json:"name"`
	Ownership           Ownership    `json:"ownership"`
	PreStateFingerprint string       `json:"preStateFingerprint,omitempty"`
}

type ReleaseState struct {
	Version string `json:"version"`
	Commit  string `json:"commit"`
}

type LifecycleOperation struct {
	ID               string          `json:"id"`
	Kind             OperationKind   `json:"kind"`
	Phase            OperationPhase  `json:"phase"`
	StartedAt        time.Time       `json:"startedAt"`
	CreatedResources []OwnedResource `json:"createdResources,omitempty"`
}

type LifecycleState struct {
	SchemaVersion int                 `json:"schemaVersion"`
	Resources     []OwnedResource     `json:"resources"`
	Operation     *LifecycleOperation `json:"operation,omitempty"`
	LastKnownGood *ReleaseState       `json:"lastKnownGood,omitempty"`
}

type LifecyclePaths struct {
	Root  string
	State string
	Lock  string
}

func NewLifecyclePaths(codexHome string) LifecyclePaths {
	root := filepath.Join(codexHome, "plugins", "data", "nunch-skills")
	return LifecyclePaths{
		Root:  root,
		State: filepath.Join(root, "lifecycle.json"),
		Lock:  filepath.Join(root, "lifecycle.lock"),
	}
}

func NewOwnedResource(
	kind ResourceKind,
	name string,
	ownership Ownership,
	fingerprint string,
	previous *OwnedResource,
) (OwnedResource, error) {
	if previous != nil && previous.Ownership != OwnershipCreated && ownership == OwnershipCreated {
		return OwnedResource{}, ErrOwnershipPromotion
	}
	if previous != nil && !validOwnershipTransition(previous.Ownership, ownership) {
		return OwnedResource{}, ErrOwnershipTransition
	}
	resource := OwnedResource{Kind: kind, Name: name, Ownership: ownership, PreStateFingerprint: fingerprint}
	if err := validateOwnedResource(resource); err != nil {
		return OwnedResource{}, err
	}
	return resource, nil
}

func BeginLifecycleOperation(state LifecycleState, operation LifecycleOperation) (LifecycleState, error) {
	if state.Operation != nil || operation.ID == "" ||
		!validOperationKind(operation.Kind) ||
		operation.Phase != PhasePrepared ||
		operation.StartedAt.IsZero() {
		return LifecycleState{}, ErrInvalidOperationTransition
	}
	state.Operation = &operation
	return state, nil
}

func AdvanceLifecycleOperation(state LifecycleState, next OperationPhase) (LifecycleState, error) {
	if state.Operation == nil || !validPhaseTransition(state.Operation.Phase, next) {
		return LifecycleState{}, ErrInvalidOperationTransition
	}
	operation := *state.Operation
	operation.Phase = next
	state.Operation = &operation
	return state, nil
}

func CompleteLifecycleOperation(state LifecycleState, release ReleaseState) (LifecycleState, error) {
	if state.Operation == nil || state.Operation.Phase != PhaseVerify || release.Version == "" || release.Commit == "" {
		return LifecycleState{}, ErrInvalidOperationTransition
	}
	state.Operation = nil
	state.LastKnownGood = &release
	return state, nil
}

func CompleteLifecycleRollback(state LifecycleState) (LifecycleState, error) {
	if state.Operation == nil || state.Operation.Phase != PhaseRollback {
		return LifecycleState{}, ErrInvalidOperationTransition
	}
	state.Operation = nil
	return state, nil
}

type LifecycleStore struct{ path string }

func NewLifecycleStore(path string) *LifecycleStore { return &LifecycleStore{path: path} }

func (store *LifecycleStore) Load() (LifecycleState, error) {
	raw, err := os.ReadFile(store.path)
	if errors.Is(err, os.ErrNotExist) {
		return LifecycleState{SchemaVersion: LifecycleSchemaVersion, Resources: []OwnedResource{}}, nil
	}
	if err != nil {
		return LifecycleState{}, fmt.Errorf("read lifecycle state: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	var state LifecycleState
	if err := decoder.Decode(&state); err != nil {
		return LifecycleState{}, fmt.Errorf("decode lifecycle state: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return LifecycleState{}, err
	}
	if state.SchemaVersion != LifecycleSchemaVersion {
		return LifecycleState{}, fmt.Errorf("schema version %d: %w", state.SchemaVersion, ErrUnsupportedLifecycleSchema)
	}
	if err := validateLifecycleState(state); err != nil {
		return LifecycleState{}, err
	}
	return state, nil
}

func (store *LifecycleStore) Save(state LifecycleState) error {
	if state.SchemaVersion != LifecycleSchemaVersion {
		return fmt.Errorf("schema version %d: %w", state.SchemaVersion, ErrUnsupportedLifecycleSchema)
	}
	if err := validateLifecycleState(state); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode lifecycle state: %w", err)
	}
	if err := writeFileAtomic(store.path, append(raw, '\n')); err != nil {
		return fmt.Errorf("save lifecycle state: %w", err)
	}
	return nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra json.RawMessage
	if err := decoder.Decode(&extra); errors.Is(err, io.EOF) {
		return nil
	} else if err != nil {
		return fmt.Errorf("decode trailing lifecycle data: %w", err)
	}
	return fmt.Errorf("multiple JSON values: %w", ErrInvalidLifecycleState)
}
