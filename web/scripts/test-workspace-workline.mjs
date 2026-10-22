import assert from "node:assert/strict";
import { deriveWorkspaceWorkline } from "../lib/workspace-v1/workline-view.ts";

const project = {
  id: 10, status: "ACTIVE", phase: "研究", phase_status: "ACTIVE",
  goal: "交付真实研究", acceptance_criteria: "验收需具备来源",
  current_summary: "执行中",
};
const tasks = [
  { id: 1, project_id: 10, title: "已通过的工作", effective_status: "COMPLETED", due_at: "2026-10-15T00:00:00Z" },
  { id: 2, project_id: 10, title: "待验收的工作", effective_status: "WAITING_REVIEW", due_at: "2026-10-19T00:00:00Z" },
  { id: 3, project_id: 10, title: "无截止日期", effective_status: "OPEN", due_at: null },
  { id: 4, project_id: 11, title: "外部项目工作", effective_status: "COMPLETED", due_at: "2026-10-14T00:00:00Z" },
];
const reports = [
  { id: 21, project_id: 10, task_id: 1, report_type: "PROGRESS", evidence_resource_ids: [101, 102] },
  { id: 22, project_id: 10, task_id: 1, report_type: "CORRECTION", evidence_resource_ids: [101] },
  { id: 23, project_id: 10, task_id: 1, report_type: "DECISION", decision_outcome: "ACCEPT", evidence_resource_ids: [103] },
  { id: 24, project_id: 11, task_id: 4, report_type: "PROGRESS", evidence_resource_ids: [900] },
  { id: 25, project_id: 10, task_id: 4, report_type: "PROGRESS", evidence_resource_ids: [901] },
];
const snapshot = deriveWorkspaceWorkline(project, tasks, reports, Date.parse("2026-10-20T00:00:00Z"));
assert.equal(snapshot.phase, "研究");
assert.equal(snapshot.projectStatus, "ACTIVE");
assert.deepEqual(snapshot.counts, {
  total: 3, completed: 1, waitingReview: 1, needsRevision: 0, overdue: 1,
});
assert.equal(snapshot.submittedVersions, 2);
assert.equal(snapshot.evidenceVersions, 2);
assert.equal(snapshot.referencedEvidenceResources, 2, "evidence links are counted uniquely, not as accepted evidence");
assert.equal(snapshot.datedTasks.length, 2);
assert.equal(snapshot.undatedTasks, 1);
assert.match(snapshot.gate, /等待指定验收人/);
assert.ok(!snapshot.datedTasks.some((item) => item.id === "4"), "foreign-project tasks must be excluded");

const afterAccepted = deriveWorkspaceWorkline(project, [
  { id: 1, project_id: 10, effective_status: "COMPLETED" },
], reports);
assert.match(afterAccepted.gate, /仍需项目负责人单独确认/);
assert.equal(afterAccepted.projectStatus, "ACTIVE", "accepting all tasks cannot close the project");
const closed = deriveWorkspaceWorkline({ ...project, status: "COMPLETED" }, [
  { id: 1, project_id: 10, effective_status: "COMPLETED" },
], reports);
assert.match(closed.gate, /明确确认完成/);

const blank = deriveWorkspaceWorkline({ id: 10, status: "ACTIVE" }, [], []);
assert.equal(blank.phase, null);
assert.equal(blank.counts.total, 0);
assert.equal(blank.undatedTasks, 0);
assert.match(blank.gate, /尚未创建工作项/);

console.log("Workspace Workline read-only projection tests passed.");
