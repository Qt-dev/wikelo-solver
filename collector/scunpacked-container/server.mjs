import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const exec = promisify(execFile);
const REPOSITORY = "https://github.com/StarCitizenWiki/scunpacked-data.git";
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024;

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) request.destroy();
    });
    request.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch { reject(new Error("invalid JSON request")); }
    });
    request.on("error", reject);
  });
}

async function fetchContracts(revision) {
  if (typeof revision !== "string" || !/^[a-f0-9]{7,64}$/i.test(revision)) throw new Error("revision must be a Git commit SHA");
  const directory = await mkdtemp(join(tmpdir(), "scunpacked-"));
  try {
    await exec("git", ["init", "--quiet", directory]);
    await exec("git", ["-C", directory, "remote", "add", "origin", REPOSITORY]);
    await exec("git", ["-C", directory, "sparse-checkout", "init", "--cone"]);
    await exec("git", ["-C", directory, "sparse-checkout", "set", "contracts"]);
    await exec("git", ["-C", directory, "fetch", "--depth=1", "--filter=blob:none", "origin", revision]);
    await exec("git", ["-C", directory, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    const [{ stdout: committedAt }, { stdout: subject }] = await Promise.all([
      exec("git", ["-C", directory, "show", "-s", "--format=%cI", "HEAD"]),
      exec("git", ["-C", directory, "show", "-s", "--format=%s", "HEAD"]),
    ]);
    const contractsDirectory = join(directory, "contracts");
    const entries = await readdir(contractsDirectory, { withFileTypes: true });
    const contracts = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) => JSON.parse(await readFile(join(contractsDirectory, entry.name), "utf8"))));
    return { revision, committedAt: committedAt.trim(), subject: subject.trim(), contracts };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/ping") return response.writeHead(200).end("ok");
    if (request.method !== "POST" || request.url !== "/contracts") return response.writeHead(404).end("not found");
    const snapshot = await fetchContracts((await readJson(request)).revision);
    const body = JSON.stringify(snapshot);
    if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error("contract response exceeds maximum size");
    response.writeHead(200, { "content-type": "application/json" }).end(body);
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "repository fetch failed" }));
  }
}).listen(8787, "0.0.0.0");
