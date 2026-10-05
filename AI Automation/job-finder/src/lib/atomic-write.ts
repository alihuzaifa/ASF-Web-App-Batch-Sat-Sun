import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Temp file + rename, so a crash mid-write never leaves a half-written file. Creates the folder if needed. */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, path);
}
