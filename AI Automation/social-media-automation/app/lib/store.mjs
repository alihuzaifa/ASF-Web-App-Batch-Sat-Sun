// Small JSON files on disk. No database: one person runs this on one machine.

import { mkdir, readFile, writeFile, rename } from "node:fs/promises"
import path from "node:path"

export const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await readFile(file, "utf8"))
  } catch {
    return fallback
  }
}

// Write to a temp file and rename, so a crash mid-write never leaves half a file.
export const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", "utf8")
  await rename(tmp, file)
}

export const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "project"
