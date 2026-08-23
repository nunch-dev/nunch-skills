package manager

func validateReleasePathSets(manifest ReleaseManifest) error {
	npmPaths := map[string]struct{}{ReleaseManifestPath: {}}
	for _, file := range manifest.NPM.Files {
		if err := addManifestPath(npmPaths, "npm", file.Path); err != nil {
			return err
		}
	}
	for _, binary := range manifest.Binaries {
		if err := addManifestPath(npmPaths, "npm", binary.NPMPath); err != nil {
			return err
		}
	}

	gitPaths := make(map[string]struct{}, 3+len(manifest.Scripts)+len(manifest.Binaries))
	for _, file := range []ReleaseFile{manifest.Marketplace, manifest.Plugin, manifest.Hook} {
		if err := addManifestPath(gitPaths, "git", file.Path); err != nil {
			return err
		}
	}
	for _, file := range manifest.Scripts {
		if err := addManifestPath(gitPaths, "git", file.Path); err != nil {
			return err
		}
	}
	for _, binary := range manifest.Binaries {
		if err := addManifestPath(gitPaths, "git", binary.GitPath); err != nil {
			return err
		}
	}
	return nil
}

func addManifestPath(paths map[string]struct{}, source string, filePath string) error {
	if _, found := paths[filePath]; found {
		return manifestError(source+".paths", "contains duplicate path", nil)
	}
	paths[filePath] = struct{}{}
	return nil
}
