import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const compose = await readFile(new URL('../../compose.private-install.yml', import.meta.url), 'utf8');
const service = await readFile(new URL('../lib/workspace-v1/service.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/workspace/workspace-app.tsx', import.meta.url), 'utf8');
const webProfile = compose.match(/\n  web:\n([\s\S]*?)(?=\nnetworks:)/)?.[1];

assert.ok(webProfile, 'Candidate must contain an isolated web service block');
assert.match(webProfile, /secrets\/workspace-service\.env/, 'Runtime receives only its restricted service credential file');

for (const key of [
    'AISYS_WORKSPACE_SESSION_KEY_FILE',
  'AISYS_CREDENTIAL_PEPPER',
  'AISYS_PUBLIC_BASE_URL',
]) {
  assert.match(webProfile, new RegExp(`\\n      ${key}:`), `${key} must reach the Workspace web service`);
}

for (const key of [
  'NOCOBASE_API_TOKEN',
  'NOCOBASE_REPORT_API_TOKEN',
  'AISYS_AGENT_REPORTER_KEY',
  'AISYS_AGENT_REPORT_TOKEN',
  'NOCOBASE_MACHINE_API_TOKEN',
  'AISYS_MACHINE_CREDENTIAL_PEPPER',
  'NOCOBASE_DISCUSSION_API_TOKEN',
  'AISYS_DISCUSSION_OWNER_TOKEN',
  'AISYS_DISCUSSION_REPORTER_KEY',
  'AISYS_OPENAI_API_KEY',
  'AISYS_ANTHROPIC_API_KEY',
  'AISYS_CUSTOM_AI_API_KEY',
  'NOCOBASE_WORK_API_TOKEN',
  'NOCOBASE_WORK_API_ROLE',
  'AISYS_WORK_OWNER_TOKEN',
  'AISYS_WORK_OWNER_AGENT_KEY',
  'AISYS_OWNER_SESSION_KEY_FILE',
  'AISYS_SETTINGS_KEY',
  'AISYS_SMTP_PASSWORD',
  'AISYS_ALLOW_TEST_ROOT_AUTH',
  'INIT_ROOT_EMAIL',
  'INIT_ROOT_PASSWORD',
]) {
  assert.doesNotMatch(webProfile, new RegExp(`\\n      ${key}:`), `${key} must not reach the public Workspace web service`);
}

assert.match(service, /step === "DONE"[\s\S]*?scopedRows\(scope, "projects"\)[\s\S]*?scopedRows\(scope, "agents"\)/);
assert.doesNotMatch(service.match(/export async function setup[\s\S]*?\n}\nexport async function invite/)?.[0] || '', /workspace_invitations|workspace_members/);
assert.match(page, /inviteUrl \|\| data\.invitations\.length[\s\S]*?"继续创建项目"/);

console.log('Workspace public profile and pending-invitation onboarding contract tests passed.');
