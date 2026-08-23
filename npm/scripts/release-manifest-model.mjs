import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

const MANIFEST_PATH = "release-manifest.json";
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

class ReleaseManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReleaseManifestError";
  }
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function isSafeRelativePath(path) {
  return path !== "" && !isAbsolute(path) && !path.includes("\\") && !path.startsWith("../") && path !== ".";
}

function gitTreeSha256(files) {
  const hash = createHash("sha256");
  for (const path of [...files.keys()].sort()) {
    if (!isSafeRelativePath(path)) {
      throw new ReleaseManifestError(`unsafe Git path: ${path}`);
    }
    const pathBytes = Buffer.from(path);
    const content = files.get(path);
    const frame = Buffer.alloc(8);
    frame.writeBigUInt64BE(BigInt(pathBytes.length));
    hash.update(frame);
    hash.update(pathBytes);
    frame.writeBigUInt64BE(BigInt(content.length));
    hash.update(frame);
    hash.update(content);
  }
  return hash.digest("hex");
}

export {
  COMMIT_PATTERN,
  MANIFEST_PATH,
  ReleaseManifestError,
  SEMVER_PATTERN,
  gitTreeSha256,
  isSafeRelativePath,
  sha256
};
