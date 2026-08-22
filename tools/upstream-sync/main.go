package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "upstream sync:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("upstream-sync", flag.ContinueOnError)
	root := flags.String("root", ".", "repository root")
	configPath := flags.String("config", "", "upstream config path")
	lockPath := flags.String("lock", "", "upstream lock path")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse arguments: %w", err)
	}
	absoluteRoot, err := filepath.Abs(*root)
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}
	if *configPath == "" {
		*configPath = filepath.Join(absoluteRoot, ".github", "upstreams.json")
	}
	if *lockPath == "" {
		*lockPath = filepath.Join(absoluteRoot, ".github", "upstreams.lock.json")
	}
	if err := syncConfigured(ctx, absoluteRoot, *configPath, *lockPath); err != nil {
		return err
	}
	fmt.Printf("synchronized upstreams from %s\n", *configPath)
	return nil
}
