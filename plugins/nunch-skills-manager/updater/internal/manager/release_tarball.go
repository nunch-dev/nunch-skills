package manager

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

const (
	maxNPMFiles             = 256
	maxNPMMembers           = 512
	maxNPMFileBytes         = 32 << 20
	maxNPMTotalBytes        = 64 << 20
	maxNPMDecompressedBytes = 72 << 20
)

var errNPMDecompressedLimit = errors.New("decompressed stream exceeds size limit")

type NPMTarballError struct {
	Path   string
	Reason string
	Cause  error
}

func (err *NPMTarballError) Error() string {
	if err.Path == "" {
		return "npm tarball: " + err.Reason
	}
	return fmt.Sprintf("npm tarball %s: %s", err.Path, err.Reason)
}

func (err *NPMTarballError) Unwrap() error {
	return err.Cause
}

func ReadNPMTarball(ctx context.Context, archive []byte) (map[string][]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, &NPMTarballError{Reason: "read canceled", Cause: err}
	}
	gzipReader, err := gzip.NewReader(bytes.NewReader(archive))
	if err != nil {
		return nil, &NPMTarballError{Reason: "gzip header is invalid", Cause: err}
	}
	gzipReader.Multistream(false)
	bounded := &contextBoundedReader{ctx: ctx, reader: gzipReader, remaining: maxNPMDecompressedBytes}
	tarReader := tar.NewReader(bounded)
	files := make(map[string][]byte)
	var totalBytes int64
	members := 0
	for {
		header, nextErr := tarReader.Next()
		if errors.Is(nextErr, io.EOF) {
			break
		}
		if nextErr != nil {
			return nil, &NPMTarballError{Reason: "tar stream is invalid", Cause: nextErr}
		}
		members++
		if members > maxNPMMembers {
			return nil, &NPMTarballError{Reason: "member count exceeds limit"}
		}
		if header.Typeflag == tar.TypeDir && validNPMDirectoryPath(header.Name) {
			continue
		}
		if len(files) >= maxNPMFiles {
			return nil, &NPMTarballError{Reason: "file count exceeds limit"}
		}
		if header.Size < 0 || totalBytes > maxNPMTotalBytes-header.Size {
			return nil, &NPMTarballError{Reason: "expanded data exceeds size limit"}
		}
		if err := readNPMMember(tarReader, header, files); err != nil {
			return nil, err
		}
		totalBytes += header.Size
	}
	if _, err := io.Copy(io.Discard, bounded); err != nil {
		return nil, &NPMTarballError{Reason: "read expanded stream failed", Cause: err}
	}
	if err := gzipReader.Close(); err != nil {
		return nil, &NPMTarballError{Reason: "gzip close failed", Cause: err}
	}
	return files, nil
}

type contextBoundedReader struct {
	ctx       context.Context
	reader    io.Reader
	remaining int64
}

func (reader *contextBoundedReader) Read(buffer []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	if reader.remaining == 0 {
		var probe [1]byte
		count, err := reader.reader.Read(probe[:])
		if count > 0 {
			return 0, errNPMDecompressedLimit
		}
		return 0, err
	}
	if int64(len(buffer)) > reader.remaining {
		buffer = buffer[:reader.remaining]
	}
	count, err := reader.reader.Read(buffer)
	reader.remaining -= int64(count)
	return count, err
}

func readNPMMember(reader io.Reader, header *tar.Header, files map[string][]byte) error {
	name, err := npmMemberPath(header.Name)
	if err != nil {
		return err
	}
	if header.Typeflag != tar.TypeReg {
		return &NPMTarballError{Path: name, Reason: "member must be a regular file"}
	}
	if header.Size < 0 || header.Size > maxNPMFileBytes {
		return &NPMTarballError{Path: name, Reason: "member exceeds size limit"}
	}
	if _, found := files[name]; found {
		return &NPMTarballError{Path: name, Reason: "duplicate member"}
	}
	data, err := io.ReadAll(io.LimitReader(reader, maxNPMFileBytes+1))
	if err != nil {
		return &NPMTarballError{Path: name, Reason: "read failed", Cause: err}
	}
	if int64(len(data)) != header.Size {
		return &NPMTarballError{Path: name, Reason: "member size mismatch"}
	}
	files[name] = data
	return nil
}

func npmMemberPath(raw string) (string, error) {
	if strings.Contains(raw, "\\") || path.Clean(raw) != raw || !strings.HasPrefix(raw, "package/") {
		return "", &NPMTarballError{Path: raw, Reason: "member path is unsafe"}
	}
	name := strings.TrimPrefix(raw, "package/")
	if !validReleasePath(name) {
		return "", &NPMTarballError{Path: raw, Reason: "member path is unsafe"}
	}
	return name, nil
}

func validNPMDirectoryPath(raw string) bool {
	trimmed := strings.TrimSuffix(raw, "/")
	return !strings.Contains(trimmed, "\\") && path.Clean(trimmed) == trimmed &&
		(trimmed == "package" || strings.HasPrefix(trimmed, "package/"))
}
