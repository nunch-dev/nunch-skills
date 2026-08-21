import { afterEach, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const root = resolve(import.meta.dir, "..")
const temporaryDirectories: string[] = []

function targetDirectory(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "nunch-skills-"))
  temporaryDirectories.push(directory)
  return resolve(directory, "skills")
}

function runInteractive(action: "install" | "uninstall", selection: string, target: string, purge = false): void {
  const arguments_ = [process.execPath, resolve(root, "scripts/skill_registry.ts"), action, "--target", target]
  if (purge) arguments_.push("--purge")
  const result = Bun.spawnSync(arguments_, {
    cwd: root,
    stdin: new TextEncoder().encode(`${selection}\n`),
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(result.exitCode).toBe(0)
}

function isLink(path: string): boolean {
  return lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true
}

afterEach(() => {
  for (const directory of temporaryDirectories) rmSync(directory, { recursive: true, force: true })
  temporaryDirectories.length = 0
})

test("keeps a shared source checkout while another selected skill remains installed", () => {
  const target = targetDirectory()
  runInteractive("install", "3,4,5", target)
  runInteractive("uninstall", "4,5", target, true)

  expect(isLink(resolve(target, "humanize-korean"))).toBe(true)
  expect(existsSync(resolve(root, ".skills-cache", "im-not-ai"))).toBe(true)

  runInteractive("uninstall", "3", target, true)

  expect(isLink(resolve(target, "humanize-korean"))).toBe(false)
  expect(existsSync(resolve(root, ".skills-cache", "im-not-ai"))).toBe(false)
})
