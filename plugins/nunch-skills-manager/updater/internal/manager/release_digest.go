package manager

import (
	"encoding/binary"
	"fmt"
	"slices"
)

type ReleaseDigestError struct {
	Path   string
	Reason string
}

func (err *ReleaseDigestError) Error() string {
	return fmt.Sprintf("release digest %s: %s", err.Path, err.Reason)
}

func GitTreeSHA256(files map[string][]byte) (string, error) {
	paths := make([]string, 0, len(files))
	for filePath := range files {
		if !validReleasePath(filePath) {
			return "", &ReleaseDigestError{Path: filePath, Reason: "path is unsafe"}
		}
		paths = append(paths, filePath)
	}
	slices.Sort(paths)
	framed := make([]byte, 0)
	var length [8]byte
	for _, filePath := range paths {
		data := files[filePath]
		binary.BigEndian.PutUint64(length[:], uint64(len(filePath)))
		framed = append(framed, length[:]...)
		framed = append(framed, filePath...)
		binary.BigEndian.PutUint64(length[:], uint64(len(data)))
		framed = append(framed, length[:]...)
		framed = append(framed, data...)
	}
	return SHA256Bytes(framed), nil
}
