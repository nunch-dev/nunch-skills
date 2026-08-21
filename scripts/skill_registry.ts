#!/usr/bin/env bun

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
} from "node:fs"
import { dirname, isAbsolute, relative, resolve } from "node:path"

type Action = "install" | "uninstall"

type Source = {
  name: string
  path: string
  skills: string[]
  repo?: string
  ref?: string
}

type Skill = {
  name: string
  source: Source
}

class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RegistryError"
  }
}

const root = resolve(import.meta.dir, "..")
const manifestPath = resolve(root, "skills.toml")
const cache = resolve(root, ".skills-cache")

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryError("skills.toml has an invalid structure")
  }
  return Object.fromEntries(Object.entries(value))
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new RegistryError(`${label} must be a string`)
  return value
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new RegistryError(`${label} must be an array of strings`)
  }
  return value
}

function skillsFromManifest(): Skill[] {
  const manifest = record(Bun.TOML.parse(readFileSync(manifestPath, "utf8")))
  if (manifest["version"] !== 1 || manifest["scope"] !== "global") {
    throw new RegistryError("skills.toml requires version = 1 and scope = global")
  }
  const agents = strings(manifest["agents"], "agents")
  if (!agents.includes("codex")) throw new RegistryError("agents must include codex")
  const sources = manifest["sources"]
  if (!Array.isArray(sources)) throw new RegistryError("skills.toml requires one or more [[sources]] entries")

  const sourceNames = new Set<string>()
  const skillNames = new Set<string>()
  const skills: Skill[] = []
  for (const rawSource of sources) {
    const sourceData = record(rawSource)
    const source: Source = {
      name: string(sourceData["name"], "source name"),
      path: string(sourceData["path"], "source path"),
      skills: strings(sourceData["skills"], "source skills"),
    }
    const repo = sourceData["repo"]
    const ref = sourceData["ref"]
    if (repo !== undefined) source.repo = string(repo, `${source.name}: repo`)
    if (ref !== undefined) source.ref = string(ref, `${source.name}: ref`)
    if (source.repo !== undefined && source.ref === undefined) {
      throw new RegistryError(`${source.name}: git sources require repo and ref`)
    }
    if (sourceNames.has(source.name)) throw new RegistryError(`duplicate source name: ${source.name}`)
    sourceNames.add(source.name)
    for (const name of source.skills) {
      if (skillNames.has(name)) throw new RegistryError(`duplicate skill name: ${name}`)
      skillNames.add(name)
      skills.push({ name, source })
    }
  }
  return skills
}

function run(command: string[], cwd?: string): void {
  console.log(`+ ${command.join(" ")}`)
  const options = { stdin: "inherit", stdout: "inherit", stderr: "inherit" } as const
  const result = cwd === undefined ? Bun.spawnSync(command, options) : Bun.spawnSync(command, { ...options, cwd })
  if (result.exitCode !== 0) throw new RegistryError(`command failed: ${command[0]}`)
}

function sourcePath(skill: Skill, checkout?: string): string {
  const base = checkout ?? root
  const path = resolve(base, skill.source.path, skill.name)
  if (!existsSync(resolve(path, "SKILL.md"))) throw new RegistryError(`${skill.name}: SKILL.md not found at ${path}`)
  return path
}

function checkoutSource(skill: Skill): string {
  const { name, repo, ref } = skill.source
  if (repo === undefined || ref === undefined) throw new RegistryError(`${skill.name}: git source is incomplete`)
  const checkout = resolve(cache, name)
  mkdirSync(cache, { recursive: true })
  if (!existsSync(checkout)) run(["git", "clone", "--depth", "1", "--branch", ref, repo, checkout])
  else {
    if (!existsSync(resolve(checkout, ".git"))) throw new RegistryError(`${skill.name}: cache path is not a git checkout: ${checkout}`)
    run(["git", "fetch", "--depth", "1", "origin", ref], checkout)
    run(["git", "checkout", "--detach", "FETCH_HEAD"], checkout)
  }
  return checkout
}

function isManagedLink(destination: string, source: string): boolean {
  const stats = lstatSync(destination, { throwIfNoEntry: false })
  return stats?.isSymbolicLink() === true && realpathSync(destination) === source
}

function installSkill(skill: Skill, target: string, force: boolean): void {
  const source = skill.source.repo === undefined ? sourcePath(skill) : sourcePath(skill, checkoutSource(skill))
  const destination = resolve(target, skill.name)
  mkdirSync(target, { recursive: true })
  if (isManagedLink(destination, source)) return console.log(`ok (already linked): ${destination}`)
  if (existsSync(destination) || lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
    if (!force) throw new RegistryError(`refusing to replace ${destination}; rerun with --force`)
    const backup = `${destination}.bak`
    if (existsSync(backup)) throw new RegistryError(`refusing to overwrite existing backup: ${backup}`)
    console.log(`+ mv ${destination} ${backup}`)
    renameSync(destination, backup)
  }
  console.log(`+ ln -s ${source} ${destination}`)
  symlinkSync(source, destination, "dir")
}

function uninstallSkill(skill: Skill, target: string): void {
  const checkout = resolve(cache, skill.source.name)
  if (skill.source.repo !== undefined && !existsSync(checkout)) {
    console.log(`ok (no cached checkout): ${skill.name}`)
    return
  }
  const source = skill.source.repo === undefined ? sourcePath(skill) : sourcePath(skill, checkout)
  const destination = resolve(target, skill.name)
  if (isManagedLink(destination, source)) {
    console.log(`+ rm ${destination}`)
    unlinkSync(destination)
  } else if (existsSync(destination) || lstatSync(destination, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
    console.log(`skip (not managed by this registry): ${destination}`)
  }
  else console.log(`ok (not installed): ${skill.name}`)
}

function hasInstalledLink(skills: Skill[], target: string, checkout: string): boolean {
  const source = realpathSync(checkout)
  return skills.some((skill) => {
    const destination = resolve(target, skill.name)
    const stats = lstatSync(destination, { throwIfNoEntry: false })
    if (stats?.isSymbolicLink() !== true) return false
    const linkedSource = realpathSync(destination)
    const relation = relative(source, linkedSource)
    return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation))
  })
}

function purgeSources(skills: Skill[], available: Skill[], target: string): void {
  const checkouts = new Set<string>()
  for (const skill of skills) {
    if (skill.source.repo !== undefined) checkouts.add(resolve(cache, skill.source.name))
  }
  for (const checkout of checkouts) {
    if (!existsSync(checkout)) continue
    if (hasInstalledLink(available, target, checkout)) {
      console.log(`keep cached source with installed skills: ${checkout}`)
      continue
    }
    console.log(`+ rm -rf ${checkout}`)
    rmSync(checkout, { recursive: true, force: true })
  }
}

function parseArguments(): { action: Action; names: string[]; target: string; force: boolean; purge: boolean } {
  const [action, ...arguments_] = process.argv.slice(2)
  if (action !== "install" && action !== "uninstall") throw new RegistryError("usage: skill_registry.ts <install|uninstall> [names...] [--target PATH] [--force|--purge]")
  let target = resolve(process.env["HOME"] ?? "~", ".codex", "skills")
  let force = false
  let purge = false
  const names: string[] = []
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === undefined) break
    if (argument === "--force") force = true
    else if (argument === "--purge") purge = true
    else if (argument === "--target") {
      const value = arguments_[index + 1]
      if (value === undefined) throw new RegistryError("--target requires a path")
      target = resolve(value)
      index += 1
    } else names.push(argument)
  }
  if (force && action === "uninstall") throw new RegistryError("--force is only valid for install")
  if (purge && action === "install") throw new RegistryError("--purge is only valid for uninstall")
  return { action, names, target, force, purge }
}

function select(skills: Skill[], names: string[]): Skill[] {
  const selected = names.map((name) => skills.find((skill) => skill.name === name))
  const missing = names.filter((_, index) => selected[index] === undefined)
  if (missing.length > 0) throw new RegistryError(`unknown skill: ${missing.join(", ")}`)
  return selected.filter((skill): skill is Skill => skill !== undefined)
}

function choose(skills: Skill[], action: Action): Skill[] {
  console.log(`\n${action === "install" ? "설치" : "제거"}할 스킬을 선택하세요.`)
  for (const [index, skill] of skills.entries()) console.log(`  ${index + 1}. ${skill.name} (${skill.source.name})`)
  console.log("  a. 전체\n  q. 취소")
  const choice = prompt("번호를 쉼표로 구분해 입력하세요:")?.trim().toLowerCase()
  if (choice === "q") return []
  if (choice === "a") return skills
  if (choice === undefined || choice === "") throw new RegistryError("스킬을 하나 이상 선택하세요")
  const indexes = choice.split(",").map((value) => Number(value.trim()))
  if (indexes.some((index) => !Number.isInteger(index) || index < 1 || index > skills.length)) {
    throw new RegistryError("목록에 없는 번호입니다")
  }
  return [...new Set(indexes)].map((index) => {
    const skill = skills[index - 1]
    if (skill === undefined) throw new RegistryError("목록에 없는 번호입니다")
    return skill
  })
}

function main(): void {
  const options = parseArguments()
  const available = skillsFromManifest()
  const skills = options.names.length === 0 ? choose(available, options.action) : select(available, options.names)
  if (skills.length === 0) return console.log("취소했습니다.")
  for (const skill of skills) {
    console.log(`== ${skill.name} ==`)
    if (options.action === "install") installSkill(skill, options.target, options.force)
    else uninstallSkill(skill, options.target)
  }
  if (options.action === "uninstall" && options.purge) purgeSources(skills, available, options.target)
}

try {
  main()
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
