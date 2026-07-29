import { getContainer } from "@cloudflare/containers";
import type { WikeloRepositoryContainer } from "@/worker/repository-container";
import type { NormalizedImportV1 } from "@/lib/contracts/api";
import { sha256 } from "./crypto";
import { importWikeloSnapshot } from "./import-service";
import { parseNormalizedImport } from "./normalized-import";
import { normalizeScunpackedContracts } from "./scunpacked";

const REPOSITORY_API = "https://api.github.com/repos/StarCitizenWiki/scunpacked-data/commits/master";
const REPOSITORY_URL = "https://github.com/StarCitizenWiki/scunpacked-data";

type RepositorySnapshot = { revision: string; committedAt: string; subject: string; contracts: unknown[] };
type RepositoryContainer = DurableObjectNamespace<WikeloRepositoryContainer>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function versionFromSubject(subject: string) {
  const match = /^(\d+(?:\.\d+){1,3})-([A-Za-z]+)\.(\d+)\b/.exec(subject.trim());
  if (!match) throw new Error(`Unsupported scunpacked-data commit subject: ${subject}`);
  return { version: match[1], channel: match[2].toUpperCase(), build: match[3] };
}

async function latestRevision() {
  const response = await fetch(REPOSITORY_API, { headers: { accept: "application/vnd.github+json", "user-agent": "wikelo-solver-sync" } });
  if (!response.ok) throw new Error(`Unable to resolve scunpacked-data HEAD (${response.status}).`);
  const body = await response.json();
  if (!isRecord(body) || typeof body.sha !== "string" || !/^[a-f0-9]{40}$/i.test(body.sha)) throw new Error("GitHub returned an invalid commit SHA.");
  return body.sha;
}

async function fetchSnapshot(containerBinding: RepositoryContainer, revision: string): Promise<RepositorySnapshot> {
  const response = await getContainer(containerBinding, "scunpacked-data").fetch("http://container/contracts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision }),
  });
  if (!response.ok) throw new Error(`Repository container failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  const body = await response.json();
  if (!isRecord(body) || typeof body.revision !== "string" || typeof body.committedAt !== "string" || typeof body.subject !== "string" || !Array.isArray(body.contracts)) throw new Error("Repository container returned an invalid snapshot.");
  if (body.revision.toLowerCase() !== revision.toLowerCase() || Number.isNaN(Date.parse(body.committedAt))) throw new Error("Repository snapshot did not match the requested revision.");
  return body as RepositorySnapshot;
}

export async function createRepositoryImport(containerBinding: RepositoryContainer): Promise<NormalizedImportV1> {
  const revision = await latestRevision();
  const snapshot = await fetchSnapshot(containerBinding, revision);
  const recipes = normalizeScunpackedContracts(snapshot.contracts).map((recipe) => ({ ...recipe, sourcePath: null }));
  if (recipes.length === 0) throw new Error("scunpacked-data contained no valid Wikelo contracts.");
  const version = versionFromSubject(snapshot.subject);
  return parseNormalizedImport({
    schema: "wikelo-normalized-v2",
    patch: {
      ...version,
      sourceHash: await sha256(JSON.stringify({ revision, recipes })),
      extractedAt: snapshot.committedAt,
      source: "scunpacked-data",
      sourceRevision: revision,
      sourceUrl: `${REPOSITORY_URL}/commit/${revision}`,
    },
    recipes,
  });
}

export async function syncRepositoryData(containerBinding: RepositoryContainer) {
  const document = await createRepositoryImport(containerBinding);
  const body = JSON.stringify(document);
  return importWikeloSnapshot(document, {
    requestId: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    bodyHash: await sha256(body),
  });
}
