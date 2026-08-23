package manager

import "slices"

func pluginNames(plugins PluginList) []string {
	names := make([]string, 0, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		names = append(names, plugin.Name)
	}
	return names
}

func installedByName(plugins PluginList) map[string]Plugin {
	installed := make(map[string]Plugin, len(plugins.Installed))
	for _, plugin := range plugins.Installed {
		if plugin.Installed {
			installed[plugin.Name] = plugin
		}
	}
	return installed
}

func (service *LifecycleService) recordMarketplace(state LifecycleState, existed bool) LifecycleState {
	ownership := OwnershipCreated
	fingerprint := ""
	if existed {
		ownership = OwnershipPreExisting
		fingerprint = "present"
	}
	return recordResource(state, ResourceMarketplace, service.config.Marketplace, ownership, fingerprint)
}

func recordPluginResource(
	state LifecycleState,
	name, marketplace string,
	installed Plugin,
) LifecycleState {
	ownership := OwnershipCreated
	fingerprint := ""
	if installed.ID != "" {
		ownership = OwnershipPreExisting
		fingerprint = installed.Version
	}
	return recordResource(state, ResourcePlugin, name+"@"+marketplace, ownership, fingerprint)
}

func recordResource(
	state LifecycleState,
	kind ResourceKind,
	name string,
	ownership Ownership,
	fingerprint string,
) LifecycleState {
	index := resourceIndex(state.Resources, kind, name)
	if index >= 0 {
		current := state.Resources[index]
		ownership = current.Ownership
		fingerprint = current.PreStateFingerprint
	}
	resource := OwnedResource{Kind: kind, Name: name, Ownership: ownership, PreStateFingerprint: fingerprint}
	if index >= 0 {
		state.Resources[index] = resource
	} else {
		state.Resources = append(state.Resources, resource)
	}
	return state
}

func resourceIndex(resources []OwnedResource, kind ResourceKind, name string) int {
	return slices.IndexFunc(resources, func(resource OwnedResource) bool {
		return resource.Kind == kind && resource.Name == name
	})
}

func preserveUnownedResources(resources []OwnedResource) []OwnedResource {
	preserved := make([]OwnedResource, 0, len(resources))
	for _, resource := range resources {
		if resource.Ownership != OwnershipCreated || resource.Kind == ResourceData {
			preserved = append(preserved, resource)
		}
	}
	return preserved
}

func removeResource(resources []OwnedResource, kind ResourceKind, name string) []OwnedResource {
	index := resourceIndex(resources, kind, name)
	if index < 0 {
		return resources
	}
	return slices.Delete(slices.Clone(resources), index, index+1)
}

func (service *LifecycleService) recordCreatedIntent(
	state LifecycleState,
	resource OwnedResource,
) (LifecycleState, error) {
	if state.Operation == nil || state.Operation.Kind != OperationInstall || resource.Ownership != OwnershipCreated {
		return LifecycleState{}, ErrInvalidLifecycleState
	}
	if resourceIndex(state.Operation.CreatedResources, resource.Kind, resource.Name) >= 0 {
		return state, nil
	}
	operation := *state.Operation
	operation.CreatedResources = append(operation.CreatedResources, resource)
	state.Operation = &operation
	state = recordResource(
		state,
		resource.Kind,
		resource.Name,
		resource.Ownership,
		resource.PreStateFingerprint,
	)
	if err := service.config.Store.Save(state); err != nil {
		return LifecycleState{}, err
	}
	return state, nil
}
