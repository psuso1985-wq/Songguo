import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await readFile(new URL("../lib/management-methods.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../app/workspace/workspace-app.tsx", import.meta.url), "utf8");
const guide = await readFile(new URL("../app/workspace/workspace-methods.tsx", import.meta.url), "utf8");
const middleware = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");

// Do not widen the public whitelist to expose historic global pages/APIs.
assert.match(middleware, /path === '\/workspace'/);
assert.doesNotMatch(middleware, /path === '\/methods'/);
assert.match(workspace, /view === "methods"/);
assert.match(workspace, /key: "methods"/);
assert.match(workspace, /href\("methods", project\.id\)/);
assert.match(guide, /methods\.map/);

for (const content of [catalog, guide]) {
  assert.doesNotMatch(content, /\beligibleApps\b/, "Generic guide cannot enumerate fixed internal Agent rosters");
  assert.doesNotMatch(content, /Owner 20\d{2}-\d{2}-\d{2}/, "Generic guide cannot hardcode an old owner decision");
}

assert.match(guide, /查看提示词不会触发 AI 执行/);
const publishedSlugs = [...catalog.matchAll(/slug: '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(publishedSlugs, [
  "decision-matrix",
  "milestone-map",
  "risk-analysis-lite",
  "root-cause-analysis",
  "swimlane",
  "turtle-diagram",
], "Only documented public management methods are included");
assert.equal((guide.match(/methods\.map/g) || []).length, 1);
console.log("Workspace management methods: shared catalog, closed public boundary and UI navigation checks passed.");
