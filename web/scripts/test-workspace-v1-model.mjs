import assert from 'node:assert/strict';
import { projectProjection, taskProjection } from '../lib/workspace-v1/model.ts';

const project = { id: 10, phase: '研究', phase_status: 'ACTIVE', status: 'ACTIVE' };
const task = { id: 20, project_id: 10, status: 'IN_PROGRESS' };
const acceptedResult = [
  { id: 30, project_id: 10, task_id: 20, report_type: 'PROGRESS', submitted_at: '2026-10-06T00:00:00Z' },
  { id: 31, project_id: 10, task_id: 20, report_type: 'DECISION', reviewed_report_id: 30, decision_outcome: 'ACCEPT', submitted_at: '2026-10-06T00:01:00Z' },
];

assert.equal(taskProjection(task, acceptedResult).effective_status, 'COMPLETED', 'an accepted result completes its Task');
const unchanged = projectProjection(project, acceptedResult);
assert.equal(unchanged.phase_status, 'ACTIVE', 'accepting a result must not complete the phase');
assert.equal(unchanged.status, 'ACTIVE', 'accepting a result must not complete the Project');

const stageCompleted = projectProjection(project, [
  ...acceptedResult,
  { id: 32, project_id: 10, report_type: 'PROJECT_EVENT', submitted_at: '2026-10-06T00:02:00Z', structured: { phase: '研究', phase_status: 'COMPLETED', status: 'ACTIVE', current_summary: '研究阶段完成', next_action: '进入交付阶段', blocker: '' } },
]);
assert.equal(stageCompleted.phase_status, 'COMPLETED', 'phase completion is an explicit machine state');
assert.equal(stageCompleted.status, 'ACTIVE', 'phase completion must not complete the Project');

console.log('Workspace V1 four-state projection tests passed.');
