import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const spacesDir = join(repoRoot, "src/app/spaces");

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(path);
  }
  return files;
}

function fail(message: string): never {
  console.error(`Performance budget failed: ${message}`);
  process.exit(1);
}

const files = walk(spacesDir);
const directGlobalSubscriptions = files
  .filter((file) => !file.endsWith("CustomNodes.tsx"))
  .flatMap((file) => {
    const source = readFileSync(file, "utf8");
    const matches = source.match(/\buse(?:Nodes|Edges)\s*\(/g) ?? [];
    return matches.map((match) => `${relative(repoRoot, file)}:${match}`);
  });

if (directGlobalSubscriptions.length > 0) {
  fail(`useNodes/useEdges outside CustomNodes.tsx:\n${directGlobalSubscriptions.join("\n")}`);
}

const projectMediaSave = readFileSync(join(spacesDir, "project-media-s3-save.ts"), "utf8");
if (!projectMediaSave.includes("preserveQuality")) {
  fail("project media S3 save must preserve quality for AI-generated/reference images.");
}

const performanceEvents = readFileSync(join(spacesDir, "performance-events.ts"), "utf8");
for (const token of [
  "FOLDDER_PERFORMANCE_MEASURE_EVENT",
  "FOLDDER_PERFORMANCE_RENDER_EVENT",
  "FOLDDER_CANVAS_PERFORMANCE_MODE_EVENT",
]) {
  if (!performanceEvents.includes(token)) fail(`missing performance event ${token}`);
}

const saveWorker = readFileSync(join(spacesDir, "project-save.worker.ts"), "utf8");
if (!saveWorker.includes("projectSaveFingerprint") || !saveWorker.includes("JSON.stringify")) {
  fail("project save worker must own fingerprint/payload serialization.");
}

console.log("Performance budget OK");
