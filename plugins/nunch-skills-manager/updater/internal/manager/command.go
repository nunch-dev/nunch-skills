package manager

import (
	"context"
	"fmt"
	"os/exec"
)

type ExecRunner struct{}

func (ExecRunner) Run(ctx context.Context, name string, args ...string) ([]byte, error) {
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("run %s: %w: %s", name, err, output)
	}
	return output, nil
}
