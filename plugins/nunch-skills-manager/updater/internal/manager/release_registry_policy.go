package manager

import (
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maxNPMRedirects = 10

type NPMRegistryPolicy struct {
	AllowHTTP bool
}

func NewNPMRegistryClient(baseURL string, client *http.Client) (*NPMRegistryClient, error) {
	return NewNPMRegistryClientWithPolicy(baseURL, client, NPMRegistryPolicy{})
}

func NewNPMRegistryClientWithPolicy(
	baseURL string,
	client *http.Client,
	policy NPMRegistryPolicy,
) (*NPMRegistryClient, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, &NPMRegistryError{Operation: "configure", Reason: "base URL is invalid", Cause: err}
	}
	if !allowedRegistryScheme(parsed.Scheme, policy) {
		return nil, &NPMRegistryError{Operation: "configure", Reason: "base URL must use HTTPS"}
	}
	if client == nil {
		return nil, &NPMRegistryError{Operation: "configure", Reason: "HTTP client is required"}
	}
	bounded := *client
	if bounded.Timeout == 0 {
		bounded.Timeout = 15 * time.Second
	}
	previousRedirect := bounded.CheckRedirect
	bounded.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= maxNPMRedirects {
			return &NPMRegistryError{Operation: "redirect", Reason: "stopped after 10 redirects"}
		}
		if !strings.EqualFold(request.URL.Host, parsed.Host) || !allowedRegistryScheme(request.URL.Scheme, policy) {
			return &NPMRegistryError{Operation: "redirect", Reason: "target is outside the approved registry"}
		}
		if previousRedirect != nil {
			return previousRedirect(request, via)
		}
		return nil
	}
	return &NPMRegistryClient{
		baseURL: strings.TrimRight(parsed.String(), "/"),
		host:    parsed.Host,
		client:  &bounded,
		policy:  policy,
	}, nil
}

func (client *NPMRegistryClient) validateTarget(target string) error {
	parsed, err := url.Parse(target)
	if err != nil || parsed.Host == "" || parsed.User != nil {
		return &NPMRegistryError{Operation: "request", Reason: "target URL is invalid", Cause: err}
	}
	if !strings.EqualFold(parsed.Host, client.host) {
		return &NPMRegistryError{Operation: "request", Reason: "target host is not the approved registry"}
	}
	if !allowedRegistryScheme(parsed.Scheme, client.policy) {
		return &NPMRegistryError{Operation: "request", Reason: "target URL must use HTTPS"}
	}
	return nil
}

func allowedRegistryScheme(scheme string, policy NPMRegistryPolicy) bool {
	return scheme == "https" || policy.AllowHTTP && scheme == "http"
}
