package manager

import (
	"bytes"
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

const (
	maxPackumentBytes = 4 << 20
	maxTarballBytes   = 64 << 20
)

type NPMRelease struct {
	Manifest      ReleaseManifest
	ManifestBytes []byte
	Files         map[string][]byte
	Integrity     string
}

type NPMRegistryClient struct {
	baseURL string
	host    string
	client  *http.Client
	policy  NPMRegistryPolicy
}

type NPMRegistryError struct {
	Operation string
	Reason    string
	Cause     error
}

func (err *NPMRegistryError) Error() string {
	return fmt.Sprintf("npm registry %s: %s", err.Operation, err.Reason)
}

func (err *NPMRegistryError) Unwrap() error {
	return err.Cause
}

func (client *NPMRegistryClient) Fetch(ctx context.Context, packageName string, version string) (NPMRelease, error) {
	metadata, err := client.fetchBytes(ctx, client.baseURL+"/"+url.PathEscape(packageName), maxPackumentBytes)
	if err != nil {
		return NPMRelease{}, err
	}
	return client.fetchVersion(ctx, packageName, version, metadata)
}

func (client *NPMRegistryClient) FetchLatest(ctx context.Context, packageName string) (NPMRelease, error) {
	metadata, err := client.fetchBytes(ctx, client.baseURL+"/"+url.PathEscape(packageName), maxPackumentBytes)
	if err != nil {
		return NPMRelease{}, err
	}
	version, err := parseLatestNPMVersion(metadata)
	if err != nil {
		return NPMRelease{}, err
	}
	return client.fetchVersion(ctx, packageName, version, metadata)
}

func (client *NPMRegistryClient) fetchVersion(
	ctx context.Context,
	packageName string,
	version string,
	metadata []byte,
) (NPMRelease, error) {
	dist, err := parseNPMDistribution(metadata, version)
	if err != nil {
		return NPMRelease{}, err
	}
	archive, err := client.fetchBytes(ctx, dist.Tarball, maxTarballBytes)
	if err != nil {
		return NPMRelease{}, err
	}
	if err := verifyNPMIntegrity(archive, dist.Integrity); err != nil {
		return NPMRelease{}, err
	}
	files, err := ReadNPMTarball(ctx, archive)
	if err != nil {
		return NPMRelease{}, err
	}
	manifestBytes, found := files[ReleaseManifestPath]
	if !found {
		return NPMRelease{}, &NPMRegistryError{Operation: "read tarball", Reason: "release manifest is missing"}
	}
	manifest, err := ParseReleaseManifest(manifestBytes)
	if err != nil {
		return NPMRelease{}, &NPMRegistryError{Operation: "parse manifest", Reason: "manifest is invalid", Cause: err}
	}
	if manifest.NPM.Name != packageName || manifest.NPM.Version != version {
		return NPMRelease{}, &NPMRegistryError{
			Operation: "parse manifest",
			Reason:    "package identity does not match request",
		}
	}
	return NPMRelease{Manifest: manifest, ManifestBytes: manifestBytes, Files: files, Integrity: dist.Integrity}, nil
}

func parseLatestNPMVersion(data []byte) (string, error) {
	var packument struct {
		DistTags struct {
			Latest string `json:"latest"`
		} `json:"dist-tags"`
	}
	if err := json.Unmarshal(data, &packument); err != nil {
		return "", &NPMRegistryError{Operation: "parse metadata", Reason: "JSON is invalid", Cause: err}
	}
	if !validSemver(packument.DistTags.Latest) {
		return "", &NPMRegistryError{Operation: "parse metadata", Reason: "latest dist-tag is invalid"}
	}
	return packument.DistTags.Latest, nil
}

func (client *NPMRegistryClient) fetchBytes(ctx context.Context, target string, limit int64) ([]byte, error) {
	if err := client.validateTarget(target); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, &NPMRegistryError{Operation: "request", Reason: "URL is invalid", Cause: err}
	}
	response, err := client.client.Do(request)
	if err != nil {
		return nil, &NPMRegistryError{Operation: "request", Reason: "request failed", Cause: err}
	}
	if response.StatusCode != http.StatusOK {
		if closeErr := response.Body.Close(); closeErr != nil {
			return nil, &NPMRegistryError{Operation: "request", Reason: "close response failed", Cause: closeErr}
		}
		return nil, &NPMRegistryError{
			Operation: "request",
			Reason:    fmt.Sprintf("unexpected HTTP status %d", response.StatusCode),
		}
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, limit+1))
	if err != nil {
		if closeErr := response.Body.Close(); closeErr != nil {
			err = errors.Join(err, closeErr)
		}
		return nil, &NPMRegistryError{Operation: "read response", Reason: "read failed", Cause: err}
	}
	if err := response.Body.Close(); err != nil {
		return nil, &NPMRegistryError{Operation: "read response", Reason: "close failed", Cause: err}
	}
	if int64(len(data)) > limit {
		return nil, &NPMRegistryError{Operation: "read response", Reason: "response exceeds size limit"}
	}
	return data, nil
}

type npmDistribution struct {
	Tarball   string `json:"tarball"`
	Integrity string `json:"integrity"`
}

func parseNPMDistribution(data []byte, version string) (npmDistribution, error) {
	var packument struct {
		Versions map[string]json.RawMessage `json:"versions"`
	}
	if err := json.Unmarshal(data, &packument); err != nil {
		return npmDistribution{}, &NPMRegistryError{Operation: "parse metadata", Reason: "JSON is invalid", Cause: err}
	}
	raw, found := packument.Versions[version]
	if !found {
		return npmDistribution{}, &NPMRegistryError{Operation: "parse metadata", Reason: "version is missing"}
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	var metadata struct {
		Dist npmDistribution `json:"dist"`
	}
	if err := decoder.Decode(&metadata); err != nil {
		return npmDistribution{}, &NPMRegistryError{
			Operation: "parse metadata",
			Reason:    "version metadata is invalid",
			Cause:     err,
		}
	}
	if metadata.Dist.Tarball == "" || metadata.Dist.Integrity == "" {
		return npmDistribution{}, &NPMRegistryError{
			Operation: "parse metadata",
			Reason:    "distribution fields are missing",
		}
	}
	return metadata.Dist, nil
}

func verifyNPMIntegrity(archive []byte, integrity string) error {
	const prefix = "sha512-"
	if !strings.HasPrefix(integrity, prefix) {
		return &NPMRegistryError{Operation: "verify integrity", Reason: "only sha512 integrity is supported"}
	}
	want, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(integrity, prefix))
	if err != nil || len(want) != sha512.Size {
		return &NPMRegistryError{Operation: "verify integrity", Reason: "sha512 integrity is invalid", Cause: err}
	}
	got := sha512.Sum512(archive)
	if subtle.ConstantTimeCompare(got[:], want) != 1 {
		return &NPMRegistryError{Operation: "verify integrity", Reason: "sha512 integrity mismatch"}
	}
	return nil
}
