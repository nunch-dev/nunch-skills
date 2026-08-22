package manager

import (
	"fmt"
	"os/exec"
)

type DetachedLauncher struct{}

func (DetachedLauncher) Launch(executable string, args []string, env []string) error {
	command := exec.Command(executable, args...)
	command.Env = env
	configureDetached(command)
	if err := command.Start(); err != nil {
		return fmt.Errorf("start detached process: %w", err)
	}
	return nil
}
