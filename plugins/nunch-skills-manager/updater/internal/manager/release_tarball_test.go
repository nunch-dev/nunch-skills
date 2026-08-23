package manager

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"testing"
)

func Test_ReadNPMTarball_rejectsTraversalMember(t *testing.T) {
	// Given
	archive := npmArchiveWithRawNames(t, map[string][]byte{"package/../escape": []byte("bad")})

	// When
	_, err := ReadNPMTarball(context.Background(), archive)

	// Then
	if err == nil {
		t.Fatal("ReadNPMTarball() error = nil")
	}
}

func Test_ReadNPMTarball_rejectsTooManyDirectoryHeaders(t *testing.T) {
	// Given
	archive := npmDirectoryArchive(t, maxNPMMembers+1)

	// When
	_, err := ReadNPMTarball(context.Background(), archive)

	// Then
	if err == nil {
		t.Fatal("ReadNPMTarball() error = nil")
	}
}

func Test_ReadNPMTarball_rejectsDecompressedStreamOverLimit(t *testing.T) {
	// Given
	archive := gzipZeros(t, maxNPMDecompressedBytes+1)

	// When
	_, err := ReadNPMTarball(context.Background(), archive)

	// Then
	if err == nil {
		t.Fatal("ReadNPMTarball() error = nil")
	}
}

func Test_ReadNPMTarball_stopsWhenContextCanceled(t *testing.T) {
	// Given
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	archive := npmArchive(t, map[string][]byte{"file": []byte("data")})

	// When
	_, err := ReadNPMTarball(ctx, archive)

	// Then
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("ReadNPMTarball() error = %v, want context.Canceled", err)
	}
}

func npmArchive(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	prefixed := make(map[string][]byte, len(files))
	for name, data := range files {
		prefixed["package/"+name] = data
	}
	return npmArchiveWithRawNames(t, prefixed)
}

func npmArchiveWithRawNames(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var output bytes.Buffer
	gzipWriter := gzip.NewWriter(&output)
	tarWriter := tar.NewWriter(gzipWriter)
	for name, data := range files {
		header := &tar.Header{Name: name, Mode: 0o600, Size: int64(len(data)), Typeflag: tar.TypeReg}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatalf("write tar header: %v", err)
		}
		if _, err := tarWriter.Write(data); err != nil {
			t.Fatalf("write tar data: %v", err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	return output.Bytes()
}

func npmDirectoryArchive(t *testing.T, count int) []byte {
	t.Helper()
	var output bytes.Buffer
	gzipWriter := gzip.NewWriter(&output)
	tarWriter := tar.NewWriter(gzipWriter)
	for index := range count {
		header := &tar.Header{Name: fmt.Sprintf("package/dir-%d/", index), Mode: 0o700, Typeflag: tar.TypeDir}
		if err := tarWriter.WriteHeader(header); err != nil {
			t.Fatalf("write directory header: %v", err)
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	return output.Bytes()
}

func gzipZeros(t *testing.T, size int64) []byte {
	t.Helper()
	var output bytes.Buffer
	writer := gzip.NewWriter(&output)
	chunk := make([]byte, 32<<10)
	for remaining := size; remaining > 0; {
		writeSize := min(int64(len(chunk)), remaining)
		if _, err := writer.Write(chunk[:writeSize]); err != nil {
			t.Fatalf("write gzip zeros: %v", err)
		}
		remaining -= writeSize
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	return output.Bytes()
}
