import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveWorkspaceWorkline } from "../lib/workspace-v1/workline-view.ts";
import { methods } from "../lib/management-methods.ts";

const app = await readFile(new URL("../app/workspace/workspace-app.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/workspace/workspace.css", import.meta.url), "utf8");
const config = await readFile(new URL("../workspace.playwright.config.ts", import.meta.url), "utf8");
const middleware = await readFile(new URL("../middleware.ts", import.meta.url), "utf8");

assert.equal(methods.length, 6, "Six public management methods expected");
assert.equal(new Set(methods.map((method) => method.slug)).size, 6, "Method slugs unique");
for (const element of [
  "WorkspaceWorkline", "WorkspaceMethodsGuide", 'view === "methods"',
  'id="workspace-project-facts"', 'id="workspace-work-items"', 'id="workspace-history"',
]) assert.ok(app.includes(element), "Missing integrated workspace component: " + element);
for (const style of [".ws-workline-metrics", ".ws-method-grid"])
  assert.ok(css.includes(style), "Missing workspace CSS: " + style);
for (const testName of ["real-workspace-v1.spec.ts", "public-workspace-methods.spec.ts"])
  assert.ok(config.includes(testName), "Missing browser suite registration: " + testName);
assert.doesNotMatch(middleware, /path === '\/methods'/, "Do not expose the legacy methods route");

const record = deriveWorkspaceWorkline({ id: 3, status: "ACTIVE" }, [
  { id: 1, project_id: 3, effective_status: "COMPLETED" },
  { id: 2, project_id: 4, effective_status: "COMPLETED" },
], []);
assert.equal(record.counts.total, 1, "Do not count cross-project tasks");
assert.equal(record.projectStatus, "ACTIVE", "Task completion cannot finish a project");
assert.match(record.gate, /仍需项目负责人单独确认/);
console.log("Integrated Workspace Workline/methods contract PASS");
