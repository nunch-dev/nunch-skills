package manager

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime"
)

var ErrIncompleteLifecycleOperation = errors.New("lifecycle operation is incomplete")

type DoctorCategoryName string

const (
	DoctorDependencies DoctorCategoryName = "dependencies"
	DoctorIntegrity    DoctorCategoryName = "integrity"
	DoctorTransaction  DoctorCategoryName = "transaction"
	DoctorTrust        DoctorCategoryName = "trust"
	DoctorOwnership    DoctorCategoryName = "ownership"
)

type DoctorStatus string

const (
	DoctorOK      DoctorStatus = "ok"
	DoctorWarning DoctorStatus = "warning"
	DoctorError   DoctorStatus = "error"
)

type DoctorCategory struct {
	Name   DoctorCategoryName `json:"name"`
	Status DoctorStatus       `json:"status"`
	Detail string             `json:"detail,omitempty"`
	Cause  error              `json:"-"`
}

type LifecycleDoctorReport struct {
	Categories   []DoctorCategory `json:"categories"`
	Dependencies DependencyReport `json:"dependencies"`
}

type LifecycleDoctorConfig struct {
	Manager        Config
	Runner         Runner
	Store          *LifecycleStore
	Manifest       *ReleaseManifest
	ManifestErr    error
	ConfigPath     string
	ExecutablePath string
}

func DiagnoseLifecycle(ctx context.Context, config LifecycleDoctorConfig) LifecycleDoctorReport {
	report := LifecycleDoctorReport{Categories: make([]DoctorCategory, 0, 5)}
	dependencies, dependencyErr := DiagnoseDependencies(ctx, config.Manager, config.Runner)
	report.Dependencies = dependencies
	report.Categories = append(report.Categories, diagnoseDependencyCategory(dependencies, dependencyErr))
	state, stateErr := config.Store.Load()
	report.Categories = append(report.Categories, diagnoseIntegrity(config))
	if stateErr != nil {
		report.Categories = append(report.Categories,
			DoctorCategory{Name: DoctorTransaction, Status: DoctorError, Detail: stateErr.Error(), Cause: stateErr},
			DoctorCategory{
				Name: DoctorTrust, Status: DoctorError, Detail: "lifecycle state unavailable", Cause: stateErr,
			},
			DoctorCategory{Name: DoctorOwnership, Status: DoctorError, Detail: stateErr.Error(), Cause: stateErr},
		)
		return report
	}
	report.Categories = append(report.Categories, diagnoseTransaction(state))
	report.Categories = append(report.Categories, diagnoseTrust(ctx, config, state))
	report.Categories = append(report.Categories, DoctorCategory{Name: DoctorOwnership, Status: DoctorOK})
	return report
}

func (report LifecycleDoctorReport) ExitCode() int {
	dependencyWarning := false
	for _, category := range report.Categories {
		if category.Status == DoctorError {
			return 1
		}
		if category.Name == DoctorDependencies && category.Status == DoctorWarning {
			dependencyWarning = true
		}
	}
	if dependencyWarning {
		return 3
	}
	return 0
}

func diagnoseDependencyCategory(report DependencyReport, err error) DoctorCategory {
	if err != nil {
		return DoctorCategory{Name: DoctorDependencies, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	if len(report.Missing) > 0 || len(report.Manual) > 0 {
		return DoctorCategory{Name: DoctorDependencies, Status: DoctorWarning, Detail: "setup is required"}
	}
	return DoctorCategory{Name: DoctorDependencies, Status: DoctorOK}
}

func diagnoseIntegrity(config LifecycleDoctorConfig) DoctorCategory {
	if config.ManifestErr != nil {
		return DoctorCategory{
			Name: DoctorIntegrity, Status: DoctorError,
			Detail: config.ManifestErr.Error(), Cause: config.ManifestErr,
		}
	}
	if config.Manifest == nil {
		err := errors.New("release manifest is unavailable")
		return DoctorCategory{Name: DoctorIntegrity, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	if _, err := MarshalReleaseManifest(*config.Manifest); err != nil {
		return DoctorCategory{Name: DoctorIntegrity, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	raw, err := os.ReadFile(config.ExecutablePath)
	if err != nil {
		return DoctorCategory{Name: DoctorIntegrity, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	want, found := releaseBinaryDigest(*config.Manifest, runtime.GOOS, runtime.GOARCH)
	if !found || SHA256Bytes(raw) != want {
		err := errors.New("lifecycle executable digest mismatch")
		return DoctorCategory{Name: DoctorIntegrity, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	return DoctorCategory{Name: DoctorIntegrity, Status: DoctorOK}
}

func diagnoseTransaction(state LifecycleState) DoctorCategory {
	if state.Operation != nil {
		detail := fmt.Sprintf("%s operation stopped at %s", state.Operation.Kind, state.Operation.Phase)
		return DoctorCategory{
			Name: DoctorTransaction, Status: DoctorError, Detail: detail, Cause: ErrIncompleteLifecycleOperation,
		}
	}
	return DoctorCategory{Name: DoctorTransaction, Status: DoctorOK}
}

func diagnoseTrust(ctx context.Context, config LifecycleDoctorConfig, state LifecycleState) DoctorCategory {
	plugins, err := listMarketplacePlugins(ctx, config.Manager, config.Runner)
	if err != nil {
		return DoctorCategory{Name: DoctorTrust, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	plugin, found := findPlugin(plugins, config.Manager.ManagerPlugin)
	if !found || config.Manifest == nil {
		return DoctorCategory{Name: DoctorTrust, Status: DoctorError, Detail: "manager plugin is missing"}
	}
	hook, err := VerifyManagerHook(plugin.Source.Path, config.Manifest.Hook.SHA256, runtime.GOOS)
	if err != nil {
		return DoctorCategory{Name: DoctorTrust, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	expected := ""
	for _, resource := range state.Resources {
		if resource.Kind == ResourceTrust && resource.Name == ManagerHookTrustID {
			expected = resource.PreStateFingerprint
			break
		}
	}
	actual, found, err := InspectTrustHash(config.ConfigPath, ManagerHookTrustID)
	if err != nil {
		return DoctorCategory{Name: DoctorTrust, Status: DoctorError, Detail: err.Error(), Cause: err}
	}
	if !found || actual != hook.TrustHash || expected != "" && actual != expected {
		return DoctorCategory{
			Name: DoctorTrust, Status: DoctorError, Detail: "manager trust hash mismatch", Cause: ErrTrustConflict,
		}
	}
	if expected == "" {
		return DoctorCategory{Name: DoctorTrust, Status: DoctorWarning, Detail: "manager trust is not owned by the CLI"}
	}
	return DoctorCategory{Name: DoctorTrust, Status: DoctorOK}
}

func releaseBinaryDigest(manifest ReleaseManifest, operatingSystem, architecture string) (string, bool) {
	platform := operatingSystem + "-" + architecture
	for _, binary := range manifest.Binaries {
		if binary.Platform == platform {
			return binary.SHA256, true
		}
	}
	return "", false
}
