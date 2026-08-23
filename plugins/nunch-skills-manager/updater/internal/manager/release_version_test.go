package manager

import "testing"

func Test_IsStrictStableUpgrade_acceptsOnlyGreaterStableSemver(t *testing.T) {
	tests := []struct {
		name      string
		current   string
		candidate string
		want      bool
	}{
		{name: "patch", current: "1.2.3", candidate: "1.2.4", want: true},
		{name: "minor", current: "1.2.9", candidate: "1.3.0", want: true},
		{name: "major", current: "1.9.9", candidate: "2.0.0", want: true},
		{name: "same", current: "1.2.3", candidate: "1.2.3"},
		{name: "build metadata is not greater", current: "1.2.3", candidate: "1.2.3+build.2"},
		{name: "downgrade", current: "2.0.0", candidate: "1.9.9"},
		{name: "prerelease", current: "1.2.3", candidate: "2.0.0-rc.1"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			// When
			got, err := IsStrictStableUpgrade(test.current, test.candidate)
			// Then
			if err != nil {
				t.Fatalf("IsStrictStableUpgrade() error = %v", err)
			}
			if got != test.want {
				t.Fatalf("IsStrictStableUpgrade() = %t, want %t", got, test.want)
			}
		})
	}
}

func Test_IsStrictStableUpgrade_rejectsInvalidLastKnownGood(t *testing.T) {
	// When
	_, err := IsStrictStableUpgrade("not-semver", "2.0.0")

	// Then
	if err == nil {
		t.Fatal("IsStrictStableUpgrade() error = nil")
	}
}
