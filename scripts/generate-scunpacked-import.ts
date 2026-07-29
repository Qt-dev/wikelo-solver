import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { normalizeScunpackedContracts } from "../lib/server/scunpacked";

const exec = promisify(execFile);

type Arguments = { contractsDir: string; output: string };

function parseArguments(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) values.set(argv[index], argv[index + 1] ?? "");
  const contractsDir = values.get("--contracts-dir");
  const output = values.get("--output");
  if (!contractsDir || !output) throw new Error("Usage: --contracts-dir <directory> --output <file>");
  return { contractsDir: resolve(contractsDir), output: resolve(output) };
}

async function git(repository: string, format: string) {
  const { stdout } = await exec("git", ["-C", repository, "log", "-1", `--format=${format}`]);
  return stdout.trim();
}

function releaseFromSubject(subject: string) {
  const match = /^(\d+(?:\.\d+){1,3})-([A-Za-z]+)\.(\d+)\b/.exec(subject);
  if (!match) throw new Error(`Unsupported scunpacked-data commit subject: ${subject}`);
  return { version: match[1], channel: match[2].toUpperCase(), build: match[3] };
}

async function main() {
  const { contractsDir, output } = parseArguments(process.argv.slice(2));
  const sourceDirectory = resolve(contractsDir, "..");
  const [revision, subject, extractedAt, entries] = await Promise.all([
    git(sourceDirectory, "%H"),
    git(sourceDirectory, "%s"),
    git(sourceDirectory, "%cI"),
    readdir(contractsDir, { withFileTypes: true }),
  ]);
  const contracts = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => readFile(join(contractsDir, entry.name), "utf8").then(JSON.parse)));
  const recipes = normalizeScunpackedContracts(contracts).map((recipe) => ({ ...recipe, sourcePath: null }));
  if (recipes.length === 0) throw new Error("scunpacked-data contained no valid Wikelo contracts.");
  const sourceHash = createHash("sha256").update(JSON.stringify({ revision, recipes })).digest("hex");
  await writeFile(output, `${JSON.stringify({
    schema: "wikelo-normalized-v2",
    patch: {
      ...releaseFromSubject(subject),
      sourceHash,
      extractedAt,
      source: "scunpacked-data",
      sourceRevision: revision,
      sourceUrl: `https://github.com/StarCitizenWiki/scunpacked-data/commit/${revision}`,
    },
    recipes,
  })}\n`);
}

await main();
