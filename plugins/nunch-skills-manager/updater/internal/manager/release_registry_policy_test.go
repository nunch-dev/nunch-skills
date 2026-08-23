package manager

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

func Test_NewNPMRegistryClient_rejectsInsecureProductionRegistry(t *testing.T) {
	// Given
	httpClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("request must not run")
	})}

	// When
	_, err := NewNPMRegistryClient("http://registry.example", httpClient)

	// Then
	if err == nil {
		t.Fatal("NewNPMRegistryClient() error = nil")
	}
}

func Test_NewNPMRegistryClientWithPolicy_allowsInsecureTestRegistry(t *testing.T) {
	// Given
	httpClient := npmRegistryHTTPClient("1.2.3", nil, "invalid")

	// When
	client, err := NewNPMRegistryClientWithPolicy(
		"http://registry.example",
		httpClient,
		NPMRegistryPolicy{AllowHTTP: true},
	)

	// Then
	if err != nil || client == nil {
		t.Fatalf("NewNPMRegistryClientWithPolicy() client = %#v, error = %v", client, err)
	}
	if err := client.validateTarget("http://registry.example/package.tgz"); err != nil {
		t.Fatalf("custom HTTP target error = %v", err)
	}
}

func Test_NPMRegistryClient_rejectsCrossHostTarballBeforeDownload(t *testing.T) {
	// Given
	requestedTarball := false
	client := registryClientWithMetadata(t, "https://evil.example/package.tgz", func(request *http.Request) {
		requestedTarball = request.URL.Host == "evil.example"
	})

	// When
	_, err := client.Fetch(context.Background(), "@nunch-dev/skills", "1.2.3")

	// Then
	if err == nil || requestedTarball {
		t.Fatalf("Fetch() error = %v, requested cross-host tarball = %t", err, requestedTarball)
	}
}

func Test_NPMRegistryClient_rejectsInsecureTarballBeforeDownload(t *testing.T) {
	// Given
	requestedTarball := false
	client := registryClientWithMetadata(t, "http://registry.example/package.tgz", func(request *http.Request) {
		requestedTarball = request.URL.Path == "/package.tgz"
	})

	// When
	_, err := client.Fetch(context.Background(), "@nunch-dev/skills", "1.2.3")

	// Then
	if err == nil || requestedTarball {
		t.Fatalf("Fetch() error = %v, requested insecure tarball = %t", err, requestedTarball)
	}
}

func Test_NPMRegistryClient_rejectsCrossHostRedirectBeforeFollowing(t *testing.T) {
	// Given
	followedRedirect := false
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host == "evil.example" {
			followedRedirect = true
		}
		return &http.Response{
			StatusCode: http.StatusFound,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     http.Header{"Location": []string{"https://evil.example/package"}},
		}, nil
	})}
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}

	// When
	_, err = client.Fetch(context.Background(), "@nunch-dev/skills", "1.2.3")

	// Then
	if err == nil || followedRedirect {
		t.Fatalf("Fetch() error = %v, followed redirect = %t", err, followedRedirect)
	}
}

func Test_NPMRegistryClient_rejectsSameHostRedirectLoopAfterTenRequests(t *testing.T) {
	// Given
	requests := 0
	httpClient := &http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		requests++
		if requests > 12 {
			return nil, errors.New("redirect cap missing")
		}
		return &http.Response{
			StatusCode: http.StatusFound,
			Body:       io.NopCloser(strings.NewReader("")),
			Header:     http.Header{"Location": []string{"https://registry.example/loop"}},
		}, nil
	})}
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}

	// When
	_, err = client.Fetch(context.Background(), "@nunch-dev/skills", "1.2.3")

	// Then
	if err == nil {
		t.Fatal("Fetch() error = nil")
	}
	if requests != 10 {
		t.Fatalf("Fetch() requests = %d, want 10", requests)
	}
}

func registryClientWithMetadata(
	t *testing.T,
	tarballURL string,
	observe func(request *http.Request),
) *NPMRegistryClient {
	t.Helper()
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		observe(request)
		body := `{"versions":{"1.2.3":{"dist":{"tarball":"` + tarballURL + `","integrity":"sha512-AA=="}}}}`
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     make(http.Header),
		}, nil
	})}
	client, err := NewNPMRegistryClient("https://registry.example", httpClient)
	if err != nil {
		t.Fatalf("NewNPMRegistryClient() error = %v", err)
	}
	return client
}
