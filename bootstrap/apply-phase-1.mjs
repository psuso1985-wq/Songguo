#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { migrateAgentsRoleTitleNullable } from './migrations/20260821-agents-role-title-nullable.mjs';
import { migrateProjectsParentAndArchived } from './migrations/20260821-project-parent-and-archived.mjs';
import { migratePhase2ProjectFacts } from './migrations/20260821-phase-2-project-facts.mjs';
import { migrateReportIdempotency } from './migrations/20260822-report-idempotency.mjs';
import { migrateReportCredentialKey } from './migrations/20260822-report-credential-key.mjs';
import { migrateProjectWaitingSince } from './migrations/20260822-project-waiting-since.mjs';
import { migrateTurnBasedDiscussion } from './migrations/20260823-turn-based-ai-discussion.mjs';
import { migrateV4ProjectLifecycle } from './migrations/20260824-v4-project-lifecycle.mjs';
import { migrateRegisteredMachines } from './migrations/20260827-registered-machines.mjs';
import { migrateReportAttachments } from './migrations/20260827-report-attachments.mjs';
import { migrateInspirations } from './migrations/20260828-inspirations.mjs';
import { migrateTeamMembers } from './migrations/20260828-team-members.mjs';
import { migrateProjectCategory } from './migrations/20260828-project-category.mjs';
import { migrateProjectPausedStatus } from './migrations/20260828-project-paused-status.mjs';
import { migrateShortCodes } from './migrations/20260828-short-codes.mjs';
import { migrateProjectAgentApiAudit } from './migrations/20260828-project-agent-api-audit.mjs';
import { migrateSkillAuthor } from './migrations/20260901-skill-author.mjs';
import { migrateSkillManagementM0 } from './migrations/20260918-skill-management-m0.mjs';
import { migrateOrgNotices } from './migrations/20260901-org-notices.mjs';
import { migrateProjectStageModel } from './migrations/20260902-project-stage-model.mjs';
import { migrateAgentStageEvents } from './migrations/20260902-agent-stage-events.mjs';
import { migrateReportDetails } from './migrations/20260908-report-details.mjs';
import { migratePeriodicReportKind } from './migrations/20260908-periodic-report-kind.mjs';
import { migrateMailSettings } from './migrations/20260911-mail-settings.mjs';
import { migrateMailDeliveriesRecipientSource } from './migrations/20260915-mail-deliveries-recipient-source.mjs';
import { ensureQueryReaderAcl } from './apply-query-reader-acl.mjs';
import { ensureDiscussionServiceAcl } from './apply-discussion-service-acl.mjs';
import { ensureWorkManagementServiceAcl } from './apply-work-management-service-acl.mjs';
import { ensureMachineCredentialServiceAcl } from './apply-machine-credential-service-acl.mjs';
import { ensureCredentialEnrollmentOperatorAcl } from './apply-credential-enrollment-operator-acl.mjs';
import { migrateRealWorkspaceV1 } from './migrations/20261003-real-workspace-v1.mjs';
import { ensureWorkspaceServiceAcl } from './apply-workspace-service-acl.mjs';

const manifestPath = new URL('./phase-1.schema.json', import.meta.url);
const baseUrl = (process.env.NOCOBASE_URL || 'http://nocobase:80').replace(/\/$/, '');
const email = process.env.INIT_ROOT_EMAIL;
const password = process.env.INIT_ROOT_PASSWORD;
if (!email || !password) throw new Error('INIT_ROOT_EMAIL and INIT_ROOT_PASSWORD are required by the bootstrap profile.');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
let token;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(path, { method = 'GET', body, query } = {}) {
  const url = new URL(baseUrl + '/api/' + path.replace(/^\//, ''));
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { method, headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: 'Bearer ' + token, 'X-Role': 'root', 'X-Authenticator': 'basic' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  if (!response.ok) throw new Error(method + ' ' + url.pathname + ' failed (' + response.status + '): ' + (json?.errors?.[0]?.message || json?.error || response.statusText));
  return json;
}
async function signIn() {
  let lastError;
  for (let attempt = 1; attempt <= 120; attempt += 1) {
    try { const result = await request('auth:signIn', { method: 'POST', body: { account: email, password } }); token = result?.data?.token; if (!token) throw new Error('The sign-in response did not contain a token.'); return; }
    catch (error) { lastError = error; await sleep(5000); }
  }
  throw new Error('NocoBase sign-in did not become ready: ' + lastError.message);
}
function presetFields() { return [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'createdBy', title: 'Created by', type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey: 'createdById', targetKey: 'id', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'updatedBy', title: 'Updated by', type: 'belongsTo', interface: 'm2o', target: 'users', foreignKey: 'updatedById', targetKey: 'id', allowNull: true },
];}
function normalizeField(spec) {
  if (!Array.isArray(spec)) return { interface: spec.type === 'belongsTo' ? 'm2o' : spec.interface, ...spec };
  const [name, title, required, kind] = spec;
  if (Array.isArray(kind)) return { name, title, type: 'string', interface: 'select', allowNull: !required,
    uiSchema: { type: 'string', title, 'x-component': 'Select', enum: kind.map((value) => ({ label: value, value })) } };
  return { name, title, type: kind === 'text' ? 'text' : 'string', interface: kind === 'text' ? 'textarea' : 'input', allowNull: !required };
}
function collectionPayload(collection) { return { name: collection.name, title: collection.title, autoGenId: false,
  fields: [...presetFields(), ...collection.fields.map(normalizeField)], indexes: collection.indexes || [] }; }
async function listMeta() { return (await request('collections:listMeta', { method: 'POST', body: {} })).data || []; }
async function applySchema() {
  await signIn(); let metadata = await listMeta(); const existing = new Set(metadata.map((entry) => entry.name));
  // A clean product installation has only NocoBase's built-in roles. Create
  // the versioned reader identity before its existing ACL verifier runs.
  const readerConfig = JSON.parse(await readFile(new URL('./query-reader-acl.json', import.meta.url), 'utf8'));
  const readerRoleName = readerConfig.role_name || readerConfig.role_key;
  const readerRoles = (await request('roles:list', { query: { paginate: 'false', 'filter[title]': readerConfig.role_title } })).data || [];
  if (!readerRoles.length) {
    await request('roles:create', { method: 'POST', body: { name: readerRoleName, title: readerConfig.role_title, allowConfigure: false, allowNewMenu: false, values: { name: readerRoleName, title: readerConfig.role_title, allowConfigure: false, allowNewMenu: false } } });
    for (const resource of readerConfig.existing_read_resources) await request('roles/' + readerRoleName + '/resources:create', { method: 'POST', body: { name: resource, usingActionsConfig: true, actions: [{ name: 'view', fields: [] }] } });
  }
  for (const collection of manifest.collections) if (!existing.has(collection.name)) { await request('collections:create', { method: 'POST', body: collectionPayload(collection) }); metadata = await listMeta(); }
  metadata = await listMeta();
  for (const collection of manifest.collections) {
    const current = metadata.find((entry) => entry.name === collection.name), fields = new Set((current?.fields || []).map((field) => field.name));
    for (const inverse of collection.inverses || []) if (!fields.has(inverse.name)) await request('collections/' + collection.name + '/fields:create', { method: 'POST', body: { interface: 'o2m', ...inverse } });
  }
  await migrateAgentsRoleTitleNullable({ request, listMeta }); await migrateProjectsParentAndArchived({ request, listMeta });
  await migratePhase2ProjectFacts({ request, listMeta }); await migrateReportIdempotency({ request, listMeta });
  await migrateReportCredentialKey({ request, listMeta }); await migrateProjectWaitingSince({ request, listMeta });
  await migrateTurnBasedDiscussion({ request, listMeta }); await migrateV4ProjectLifecycle({ request, listMeta });
  await migrateRegisteredMachines({ request, listMeta });
  await migrateReportAttachments({ request, listMeta });
  await migrateInspirations({ request, listMeta });
  await migrateTeamMembers({ request, listMeta });
  await migrateProjectCategory({ request, listMeta });
  await migrateProjectPausedStatus({ request, listMeta });
  await migrateShortCodes({ request, listMeta });
  await migrateProjectAgentApiAudit({ request, listMeta });
  await migrateSkillAuthor({ request, listMeta });
  await migrateSkillManagementM0({ request, listMeta });
  await migrateOrgNotices({ request, listMeta });
  await migrateProjectStageModel({ request, listMeta });
  await migrateAgentStageEvents({ request, listMeta });
  await migrateReportDetails({ request, listMeta });
  await migratePeriodicReportKind({ request, listMeta });
  await migrateMailSettings({ request, listMeta });
  await migrateMailDeliveriesRecipientSource({ request, listMeta });
  await migrateRealWorkspaceV1({ request, listMeta });
  await ensureQueryReaderAcl({ request }); await ensureDiscussionServiceAcl({ request }); await ensureWorkManagementServiceAcl({ request });
  await ensureMachineCredentialServiceAcl({ request });
  await ensureCredentialEnrollmentOperatorAcl({ request });
  await ensureWorkspaceServiceAcl({ request, listMeta });
}
async function main() { await applySchema(); console.log('Workspace V0.1 schema bootstrap completed; no fixtures or private Skills imported.'); }
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
