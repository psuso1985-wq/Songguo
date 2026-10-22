import assert from 'node:assert/strict';
import { ensureWorkspaceServiceAcl, memberRestrictedResources, restoreWorkspaceServiceAcl, snapshotWorkspaceServiceAcl, workspaceResources, workspaceRole, workspaceServiceAclSnapshotsEqual } from '../../bootstrap/apply-workspace-service-acl.mjs';

const calls = [];
const memberBefore = [
  { id: 1, name: 'agents', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] },
  { id: 2, name: 'projects', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] },
  { id: 3, name: 'attachments', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] },
];
async function request(path, options = {}) {
  calls.push({ path, options });
  if (path === 'authenticators:list') return { data: [{ id: 7, enabled: false, options: { public: {} } }] };
  if (path === 'roles:list') return { data: [{ id: 8, name: workspaceRole }] };
  if (path === `roles/${workspaceRole}/resources:list`) return { data: [] };
  if (path === 'roles/member/resources:list') return { data: memberBefore };
  return { data: {} };
}
const meta = workspaceResources.filter((name) => name !== 'attachments').map((name) => ({ name, fields: [{ name: 'id', type: 'bigInt' }] }));
await ensureWorkspaceServiceAcl({ request, listMeta: async () => meta });

const memberWrites = calls.filter((call) => /^roles\/member\/resources:(create|update)$/.test(call.path));
assert.deepEqual(memberWrites.map((call) => call.options.body.name).sort(), [...memberRestrictedResources].sort());
assert.ok(!memberWrites.some((call) => ['agents', 'projects', 'project_members', 'work_tasks', 'project_reports', 'agent_credentials', 'attachments'].includes(call.options.body.name)), 'legacy member ACL grants must not be rewritten');
const eventGrant = calls.find((call) => call.options.body?.name === 'workspace_events' && call.path.startsWith(`roles/${workspaceRole}/`));
assert.deepEqual(eventGrant.options.body.actions.map((action) => action.name), ['view', 'create'], 'event history must be append-only for the service role');

let authenticator = { id: 7, enabled: false, options: { public: { allowSignUp: false } } };
let workspaceRoleState = {
  id: 8,
  name: workspaceRole,
  title: 'before',
  description: 'before description',
  strategy: { actions: ['view'] },
  default: false,
  hidden: true,
  allowConfigure: false,
  allowNewMenu: false,
  snippets: ['!ui.*', '!pm', '!pm.*'],
};
const roleResources = {
  [workspaceRole]: [{ id: 10, name: 'projects', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] }],
  member: [
    { id: 20, name: 'workspaces', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] },
    { id: 21, name: 'agents', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id', 'name'] }] },
  ],
};
let nextId = 30;
async function statefulRequest(path, options = {}) {
  if (path === 'authenticators:list') return { data: [structuredClone(authenticator)] };
  if (path === 'authenticators:update') { authenticator = { ...authenticator, ...structuredClone(options.body) }; return { data: authenticator }; }
  if (path === 'roles:list') return { data: [structuredClone(workspaceRoleState)] };
  if (path === 'roles:update') {
    workspaceRoleState = { ...workspaceRoleState, ...structuredClone(options.body) };
    return { data: structuredClone(workspaceRoleState) };
  }
  const match = path.match(/^roles\/(.+)\/resources:(list|create|update|destroy)$/);
  if (!match) return { data: {} };
  const [, role, action] = match;
  const rows = roleResources[role] ||= [];
  if (action === 'list') return { data: structuredClone(rows) };
  const index = rows.findIndex((row) => String(row.id) === String(options.query?.filterByTk));
  if (action === 'destroy') { if (index >= 0) rows.splice(index, 1); return { data: {} }; }
  const saved = { id: index >= 0 ? rows[index].id : nextId++, ...structuredClone(options.body) };
  if (index >= 0) rows[index] = saved; else rows.push(saved);
  return { data: saved };
}
const aclSnapshot = await snapshotWorkspaceServiceAcl({ request: statefulRequest });
authenticator = { id: 7, enabled: true, options: { public: { allowSignUp: true } } };
workspaceRoleState = { ...workspaceRoleState, title: 'mutated', snippets: ['pm.api-keys.configuration'] };
roleResources[workspaceRole][0].actions = [{ name: 'update', fields: ['id'] }];
roleResources[workspaceRole].push({ id: 11, name: 'workspaces', usingActionsConfig: true, actions: [] });
roleResources.member[0].actions = [];
const restoredSnapshot = await restoreWorkspaceServiceAcl({ request: statefulRequest, snapshot: aclSnapshot });
assert.ok(workspaceServiceAclSnapshotsEqual(restoredSnapshot, aclSnapshot), 'ACL rollback readback must match the captured snapshot field-for-field');
assert.deepEqual(authenticator, { id: 7, enabled: false, options: { public: { allowSignUp: false } } });
assert.deepEqual(workspaceRoleState.snippets, ['!ui.*', '!pm', '!pm.*'], 'role snippets must be restored exactly');
assert.deepEqual(roleResources[workspaceRole], [{ id: 10, name: 'projects', usingActionsConfig: true, actions: [{ name: 'view', fields: ['id'] }] }]);
assert.deepEqual(roleResources.member.find((row) => row.name === 'workspaces').actions, [{ name: 'view', fields: ['id'] }]);
assert.deepEqual(roleResources.member.find((row) => row.name === 'agents').actions, [{ name: 'view', fields: ['id', 'name'] }], 'rollback must not touch a legacy member grant');

console.log('Workspace V1 ACL scope tests passed.');
