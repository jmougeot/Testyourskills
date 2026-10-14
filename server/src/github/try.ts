// Essai manuel : npx tsx server/src/github/try.ts <login> [--level N] [--facts] [--save chemin.json] [--pick]
// Collecte, note (ai=null, ou niveau IA simulé avec --level) et affiche la carte JSON.

import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import type { CodeReadingResult } from "../../../shared/readings";
import { scoreGithub } from "../scoring/index";
import { collectGithub, EngineError, pickFilesForReading } from "./collect";

const args = process.argv.slice(2);
const login = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a) && !a.endsWith(".json"));
const flag = (k: string) => args.includes(k);
const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);

if (!login) {
  console.error("usage : npx tsx server/src/github/try.ts <login> [--level N] [--facts] [--save f.json] [--pick]");
  process.exit(1);
}

const token = process.env.GITHUB_TOKEN || execSync("gh auth token").toString().trim();
const t0 = Date.now();
const progress: string[] = [];
try {
  const facts = await collectGithub(login, {
    token,
    onProgress: (e) => progress.push(`${e.key}${e.n !== undefined ? "=" + e.n : ""}@${Date.now() - t0}ms`),
  });
  const ms = Date.now() - t0;
  const save = val("--save");
  if (save) writeFileSync(save, JSON.stringify(facts, null, 2));
  const level = val("--level");
  const ai: CodeReadingResult | null = level
    ? {
        readings: facts.activeRepos.slice(0, 3).map((repo) => ({
          repo,
          level: Number(level) as 1 | 2 | 3 | 4 | 5,
          evidence_file: "simulé",
          evidence_quote: "",
          observed_traits: [],
        })),
        ai_status: null,
      }
    : null;
  const card = scoreGithub(facts, ai, { lang: "fr", judgedInSeconds: Math.round(ms / 1000) });
  if (flag("--facts")) console.log(JSON.stringify(facts, null, 2));
  console.log(JSON.stringify(card, null, 2));
  console.error(`\ncollecte : ${ms} ms · progression : ${progress.join(", ")}`);
  console.error(
    `${card.name} · ${card.overall} ${card.tier}${card.special ? " (" + card.special + ")" : ""} · ${card.position} · ` +
      card.stats.map((s) => `${s.code} ${s.value}${s.sufficient ? "" : "*"}`).join(" ") +
      ` · fiabilité ${card.reliability} · ${card.statuses.map((s) => s.label.fr).join(" | ")}`,
  );
  if (flag("--pick")) {
    const t1 = Date.now();
    const files = await pickFilesForReading(facts, { token });
    const total = files.reduce((s, r) => s + r.files.reduce((a, f) => a + Buffer.byteLength(f.content), 0), 0);
    console.error(`pick : ${Date.now() - t1} ms, ${total} octets`);
    for (const r of files) console.error(`  ${r.repo} (activité ${r.activity}) : ${r.files.map((f) => f.path).join(", ")}`);
  }
} catch (e) {
  if (e instanceof EngineError) {
    console.error(`EngineError(${e.code}) : ${e.message} [${Date.now() - t0} ms]`);
    process.exit(2);
  }
  throw e;
}
