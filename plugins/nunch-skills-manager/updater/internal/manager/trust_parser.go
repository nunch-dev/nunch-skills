package manager

import (
	"bytes"
	"fmt"
)

func findTrustSection(config []byte, id string) (trustSection, bool, error) {
	target := []byte(`[hooks.state."` + id + `"]`)
	starts := tableStarts(config)
	var found *trustSection
	for index, start := range starts {
		lineEnd := bytes.IndexByte(config[start:], '\n')
		if lineEnd < 0 {
			lineEnd = len(config) - start
		}
		header := bytes.TrimSuffix(bytes.TrimSpace(config[start:start+lineEnd]), []byte{'\r'})
		if !bytes.Equal(header, target) {
			continue
		}
		end := len(config)
		if index+1 < len(starts) {
			end = starts[index+1]
		}
		section, err := parseTrustSection(config, start, end)
		if err != nil {
			return trustSection{}, false, err
		}
		if found != nil {
			return trustSection{}, false, fmt.Errorf("duplicate hook trust section: %w", ErrMalformedTrustSection)
		}
		found = &section
	}
	if found == nil {
		return trustSection{}, false, nil
	}
	return *found, true, nil
}

func tableStarts(config []byte) []int {
	starts := make([]int, 0)
	for offset := 0; offset < len(config); {
		end := bytes.IndexByte(config[offset:], '\n')
		if end < 0 {
			end = len(config) - offset
		}
		line := bytes.TrimSpace(config[offset : offset+end])
		if len(line) >= 2 && line[0] == '[' && line[len(line)-1] == ']' {
			starts = append(starts, offset)
		}
		offset += end
		if offset < len(config) {
			offset++
		}
	}
	return starts
}

func parseTrustSection(config []byte, start, end int) (trustSection, error) {
	body := config[start:end]
	matches := trustHashLine.FindAllSubmatchIndex(body, -1)
	if len(matches) != 1 {
		return trustSection{}, fmt.Errorf("target hook trust hash count %d: %w", len(matches), ErrMalformedTrustSection)
	}
	hash := string(body[matches[0][4]:matches[0][5]])
	return trustSection{start: start, end: end, hash: hash}, nil
}
