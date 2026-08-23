import { execFileSync } from "node:child_process";

import { ReleaseManifestError } from "./release-manifest-model.mjs";

const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;

function runGit(repo, args, encoding = "utf8") {
  try {
    return execFileSync("git", ["-C", repo, ...args], {
      encoding,
      maxBuffer: MAX_GIT_OUTPUT_BYTES,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    throw new ReleaseManifestError(`git ${args.join(" ")} failed${detail === "" || detail === undefined ? "" : `: ${detail}`}`);
  }
}

function readGitFile(repo, commit, path) {
  return Buffer.from(runGit(repo, ["show", `${commit}:${path}`], "buffer"));
}

function gitTree(repo, commit) {
  const output = runGit(repo, ["ls-tree", "-r", "-z", "--name-only", commit], "buffer");
  const paths = output.toString("utf8").split("\0").filter(Boolean);
  const files = new Map();
  for (const path of paths) {
    if (files.has(path)) {
      throw new ReleaseManifestError(`duplicate Git path: ${path}`);
    }
    files.set(path, readGitFile(repo, commit, path));
  }
  return files;
}

export { gitTree, runGit };
