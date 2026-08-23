package manager

import (
	"errors"
	"strings"
)

var ErrInvalidReleaseVersion = errors.New("invalid stable release version")

func IsStrictStableUpgrade(current string, candidate string) (bool, error) {
	currentParts := stableVersionParts(current)
	if currentParts == nil {
		return false, ErrInvalidReleaseVersion
	}
	candidateParts := stableVersionParts(candidate)
	if candidateParts == nil {
		return false, nil
	}
	for index := range currentParts {
		comparison := compareVersionNumber(currentParts[index], candidateParts[index])
		if comparison < 0 {
			return true, nil
		}
		if comparison > 0 {
			return false, nil
		}
	}
	return false, nil
}

func stableVersionParts(version string) []string {
	match := semverPattern.FindStringSubmatch(version)
	if match == nil || match[4] != "" {
		return nil
	}
	return []string{match[1], match[2], match[3]}
}

func compareVersionNumber(left string, right string) int {
	if len(left) != len(right) {
		return len(left) - len(right)
	}
	return strings.Compare(left, right)
}
