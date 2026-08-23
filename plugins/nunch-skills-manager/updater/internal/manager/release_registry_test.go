package manager

import (
	"bytes"
	"context"
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
)

func Test_NPMRegistryClient_fetchesVerifiedTarballWithoutExecutingPackageCode(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	launcher := []byte("launcher")
	manifest.NPM.Files[0].SHA256 = SHA256Bytes(launcher)
	archive := npmArchive(t, map[string][]byte{
		ReleaseManifestPath: mustMarshalRelease(t, manifest),
		"bin/launcher.js":   launcher,
	})
	integrity := sha512Integrity(archive)
	httpClient := npmRegistryHTTPClient(manifest.NPM.Version, archive, integrity)
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}

	// When
	release, err := client.Fetch(context.Background(), manifest.NPM.Name, manifest.NPM.Version)
	// Then
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if release.Manifest.NPM.Version != manifest.NPM.Version {
		t.Fatalf("Fetch() version = %q", release.Manifest.NPM.Version)
	}
	if !bytes.Equal(release.Files["bin/launcher.js"], launcher) {
		t.Fatal("Fetch() did not preserve launcher bytes")
	}
}

func Test_NPMRegistryClient_fetchesLatestDistTagWithoutExecutingPackageCode(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	launcher := []byte("launcher")
	manifest.NPM.Files[0].SHA256 = SHA256Bytes(launcher)
	archive := npmArchive(t, map[string][]byte{
		ReleaseManifestPath: mustMarshalRelease(t, manifest),
		"bin/launcher.js":   launcher,
	})
	httpClient := npmRegistryHTTPClient(manifest.NPM.Version, archive, sha512Integrity(archive))
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}

	// When
	release, err := client.FetchLatest(context.Background(), manifest.NPM.Name)
	// Then
	if err != nil {
		t.Fatalf("FetchLatest() error = %v", err)
	}
	if release.Manifest.NPM.Version != manifest.NPM.Version {
		t.Fatalf("FetchLatest() version = %q", release.Manifest.NPM.Version)
	}
}

func Test_NPMRegistryClient_rejectsTarballIntegrityMismatch(t *testing.T) {
	// Given
	manifest := validReleaseManifest(t)
	archive := npmArchive(t, map[string][]byte{ReleaseManifestPath: mustMarshalRelease(t, manifest)})
	badIntegrity := "sha512-" + base64.StdEncoding.EncodeToString(make([]byte, sha512.Size))
	httpClient := npmRegistryHTTPClient(manifest.NPM.Version, archive, badIntegrity)
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}

	// When
	_, err = client.Fetch(context.Background(), manifest.NPM.Name, manifest.NPM.Version)

	// Then
	if err == nil {
		t.Fatal("Fetch() error = nil")
	}
}

func npmRegistryHTTPClient(version string, archive []byte, integrity string) *http.Client {
	return &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		var body []byte
		switch request.URL.Path {
		case "/@nunch-dev%2Fskills", "/@nunch-dev/skills":
			body = []byte(fmt.Sprintf(
				`{"dist-tags":{"latest":%q},"versions":{%q:{"dist":{"tarball":%q,"integrity":%q}}}}`,
				version,
				version,
				"https://registry.example/package.tgz",
				integrity,
			))
		case "/package.tgz":
			body = archive
		default:
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(strings.NewReader("not found")),
				Header:     make(http.Header),
			}, nil
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(bytes.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	})}
}

type roundTripFunc func(request *http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func sha512Integrity(data []byte) string {
	sum := sha512.Sum512(data)
	return "sha512-" + base64.StdEncoding.EncodeToString(sum[:])
}

func mustMarshalRelease(t *testing.T, manifest ReleaseManifest) []byte {
	t.Helper()
	data, err := MarshalReleaseManifest(manifest)
	if err != nil {
		t.Fatalf("MarshalReleaseManifest() error = %v", err)
	}
	return data
}
