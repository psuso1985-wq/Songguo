import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../../bootstrap/migrations/20261003-real-workspace-v1.mjs', import.meta.url), 'utf8');
const sql = await readFile(new URL('../../bootstrap/migrations/20261003-real-workspace-v1.sql', import.meta.url), 'utf8');
const service = await readFile(new URL('../lib/workspace-v1/service.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/workspace/workspace-app.tsx', import.meta.url), 'utf8');

assert.match(migration, /name: 'workspace_events'/);
assert.match(migration, /string\('phase_status'\)/);
assert.match(sql, /songguo_workspace_event_immutable/);
for (const event of ['TASK_STARTED', 'AGENT_CONNECTED', 'AGENT_REVOKED', 'INVITATION_PENDING', 'INVITATION_ACCEPTED', 'INVITATION_REVOKED', 'INVITATION_EXPIRED']) {
  assert.match(service, new RegExp(`event_type: "${event}"`), `${event} must append a durable event`);
}
assert.match(page, /data\.events\.some/);
assert.match(page, /阶段状态（独立于项目状态）/);

console.log('Workspace V1 append-only history contract tests passed.');
