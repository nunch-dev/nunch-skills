package manager

import (
	"errors"
	"testing"
)

func Test_LifecycleDoctorReport_distinguishes_dependencies_from_integrity_failures(t *testing.T) {
	// Given
	report := LifecycleDoctorReport{Categories: []DoctorCategory{
		{Name: DoctorDependencies, Status: DoctorWarning, Detail: "missing runtime"},
		{Name: DoctorIntegrity, Status: DoctorOK},
		{Name: DoctorTransaction, Status: DoctorOK},
		{Name: DoctorTrust, Status: DoctorOK},
		{Name: DoctorOwnership, Status: DoctorOK},
	}}

	// When
	dependencyExit := report.ExitCode()
	report.Categories[1] = DoctorCategory{Name: DoctorIntegrity, Status: DoctorError, Detail: "digest mismatch"}
	integrityExit := report.ExitCode()

	// Then
	if dependencyExit != 3 || integrityExit != 1 {
		t.Fatalf("ExitCode() dependency = %d, integrity = %d", dependencyExit, integrityExit)
	}
}

func Test_LifecycleDoctorReport_marks_interrupted_operation_as_transaction_error(t *testing.T) {
	// Given
	state := LifecycleState{SchemaVersion: LifecycleSchemaVersion, Operation: &LifecycleOperation{
		ID: "op-1", Kind: OperationInstall, Phase: PhasePlugins,
	}}

	// When
	category := diagnoseTransaction(state)

	// Then
	if category.Status != DoctorError || !errors.Is(category.Cause, ErrIncompleteLifecycleOperation) {
		t.Fatalf("diagnoseTransaction() = %#v", category)
	}
}
