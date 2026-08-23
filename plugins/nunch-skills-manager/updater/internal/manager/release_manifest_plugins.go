package manager

import "strings"

func validateReleasePlugins(plugins []ReleasePlugin) error {
	if len(plugins) == 0 {
		return manifestError("plugins", "must not be empty", nil)
	}
	managerFound := false
	for index, plugin := range plugins {
		if plugin.Name == "" || strings.ContainsAny(plugin.Name, "@/\\") || !validSemver(plugin.Version) {
			return manifestError("plugins", "contains invalid identity", nil)
		}
		if index > 0 && plugins[index-1].Name >= plugin.Name {
			return manifestError("plugins", "must contain unique sorted names", nil)
		}
		managerFound = managerFound || plugin.Name == defaultManagerPlugin
	}
	if !managerFound {
		return manifestError("plugins", "must contain nunch-skills-manager", nil)
	}
	return nil
}
