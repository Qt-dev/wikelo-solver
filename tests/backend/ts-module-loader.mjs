import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import ts from "typescript";

const cache = new Map();

async function compile(path) {
  const absolute = resolve(path);
  if (cache.has(absolute)) return cache.get(absolute);
  const promise = (async () => {
    const source = await readFile(absolute, "utf8");
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const matches = [...output.matchAll(/from\s+(["'])(\.\.?\/[^"']+)\1/g)];
    for (const match of matches) {
      const specifier = match[2];
      const dependency = await compile(resolve(dirname(absolute), `${specifier}.ts`));
      output = output.replace(match[0], `from ${match[1]}${dependency}${match[1]}`);
    }
    return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
  })();
  cache.set(absolute, promise);
  return promise;
}

export async function importTypeScript(path) {
  return import(await compile(path));
}
