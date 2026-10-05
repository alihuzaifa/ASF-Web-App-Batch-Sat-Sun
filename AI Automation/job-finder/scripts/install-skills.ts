// `npm run install-skills` — copies linkedin-skills/skills/li-* into ~/.claude/skills/ and a blank voice
// profile into ~/.claude/linkedin/voice.md (never overwriting one you already filled in).
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ROOT } from "../src/lib/paths.js";

const src = join(ROOT, "linkedin-skills", "skills");
const skillsDir = join(homedir(), ".claude", "skills");
const voiceDir = join(homedir(), ".claude", "linkedin");
mkdirSync(skillsDir, { recursive: true });
mkdirSync(voiceDir, { recursive: true });

const names = readdirSync(src).filter((n) => n.startsWith("li-"));
for (const name of names) {
  const dest = join(skillsDir, name);
  const existed = existsSync(dest);
  cpSync(join(src, name), dest, { recursive: true, force: true });
  console.log(`${existed ? "updated  " : "installed"} ${dest}`);
}

const voice = join(voiceDir, "voice.md");
if (existsSync(voice)) console.log(`kept      ${voice} (already exists)`);
else {
  cpSync(join(ROOT, "linkedin-skills", "voice.md"), voice);
  console.log(`created   ${voice}  <- fill this in`);
}
console.log(`\n${names.length} skills ready. Restart Claude Code, then try /li-profile or /li-post.`);
