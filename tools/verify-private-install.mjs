// Isolated acceptance fixture and readback; never prints credentials or cookies.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseConfig, validateName } from './private-install.mjs';
const [mode, name] = process.argv.slice(2);
assert.ok(['seed', 'readback'].includes(mode), 'Usage: node tools/verify-private-install.mjs seed|readback NAME');
validateName(name);
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = join(root, '.private-install', name);
const meta = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8'));
assert.equal(meta.root + '/', root);
const config = parseConfig(await readFile(join(dir, 'instance.env'), 'utf8'));
const base = `http://127.0.0.1:${meta.webPort}`;
const stateFile = join(dir, 'secrets/acceptance-state.json');
const hash = async (file) => createHash('sha256').update(await readFile(join(dir, file))).digest('hex');
const hashes = async () => Object.fromEntries(await Promise.all(['instance.env', 'secrets/workspace-session.key', 'secrets/workspace-service.env'].map(async (p) => [p, await hash(p)])));
let cookie = '';
async function api(path, body, expected = 200) {
  const r = await fetch(base + '/api/v1/' + path, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(30000),
    headers: { Origin: base, Cookie: cookie, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(r.status, expected, `Acceptance HTTP status at ${path}`);
  if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
  return r.json();
}
const login = await fetch(`http://127.0.0.1:${meta.backendPort}/api/auth:signIn`, { method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
  body: JSON.stringify({ account: config.INIT_ROOT_EMAIL, password: config.INIT_ROOT_PASSWORD }) });
assert.equal(login.status, 200);
const rootToken = (await login.json()).data.token;
async function native(path) {
  const r = await fetch(`http://127.0.0.1:${meta.backendPort}/api/${path}`, { headers: { Authorization: 'Bearer ' + rootToken, 'X-Role': 'root' } });
  assert.equal(r.status, 200, 'Native acceptance read failed'); return (await r.json()).data;
}
async function identities() {
  const users = (await native('users:list?paginate=false&appends=roles')).filter((u) => u.username?.startsWith('sg_workspace_bridge_'));
  assert.equal(users.length, 1, 'Exactly one installer service identity is required');
  assert.deepEqual(users[0].roles.map((r) => r.name), ['songguo-workspace-service']);
  // apiKeys:list is scoped to its authenticated creator even for root. Count
  // IDs only via a read-only SQL query in this UUID-labelled test PostgreSQL;
  // never grant the web role key-management permissions or select key values.
  const exec = promisify(execFile);
  const ids = (await exec('docker', ['--context', 'default', 'ps', '-q', '--filter', `label=com.docker.compose.project=${meta.project}`, '--filter', 'label=com.docker.compose.service=postgres', '--filter', `label=io.songguo.private-instance=${meta.id}`])).stdout.trim().split(/\s+/).filter(Boolean);
  assert.equal(ids.length, 1, 'Expected exactly this isolated PostgreSQL container');
  const keys = (await exec('docker', ['--context', 'default', 'exec', ids[0], 'psql', '-U', 'songguo_private', '-d', 'songguo_private', '-At', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT id::text FROM "apiKeys" ORDER BY id'])).stdout.trim().split(/\s+/).filter(Boolean);
  assert.equal(keys.length, 1, 'Exactly one service API key is required');
  return { bridgeUserId: users[0].id, apiKeyId: keys[0] };
}
if (mode === 'seed') {
  for (const collection of ['workspaces', 'projects', 'agents', 'project_reports']) {
    assert.equal((await native(`${collection}:list?paginate=false`)).length, 0, `Expected fresh empty business collection ${collection}`);
  }
  const serviceIdentities = await identities();
  console.log('PASS fresh empty business tables and one restricted service identity/API key');
  const fixture = { email: `persist-${randomUUID()}@example.invalid`, password: randomUUID() + '!aA7' };
  await writeFile(stateFile, JSON.stringify({ ...fixture, phase: 'prepared' }) + '\n', { flag: 'wx', mode: 0o600 });
  await api('auth/register', { name: '安装持久化验收', ...fixture });
  const workspace = (await api('workspaces', { name: '隔离安装持久化空间' }, 201)).workspace;
  const project = (await api(`workspaces/${workspace.workspace_key}/projects`, {
    name: '空库安装回读项目', goal: '只使用隔离测试数据验证同实例持久化。', acceptance_criteria: '重复安装和重启后 ID、目标及验收标准保持一致。',
  }, 201));
  assert.ok(project.id && project.project_key, 'Project creation must return a durable ID and key');
  const state = { ...fixture, workspaceKey: workspace.workspace_key, project, hashes: await hashes(), identities: serviceIdentities };
  await writeFile(stateFile, JSON.stringify(state) + '\n', { mode: 0o600 });
  console.log('PASS fresh empty business tables; registered synthetic user, workspace/project, one restricted identity and one API key; protected persistence fixture saved');
} else {
  const state = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.ok(state.project?.id && state.workspaceKey, 'Acceptance fixture is incomplete; retain it and diagnose before retrying');
  await api('auth/login', { email: state.email, password: state.password });
  const snapshot = await api('workspaces/' + state.workspaceKey);
  const project = snapshot.projects.find((p) => String(p.id) === String(state.project.id));
  assert.ok(project, 'Original project must survive');
  for (const field of ['project_key', 'name', 'goal', 'acceptance_criteria']) assert.equal(project[field], state.project[field], 'Persisted ' + field);
  assert.deepEqual(await hashes(), state.hashes, 'Secrets/config must not rotate');
  assert.deepEqual(await identities(), state.identities, 'Service user/key must not duplicate or change');
  console.log('PASS original user login, same workspace/project and facts, unchanged secret hashes and service user/API key IDs');
}
