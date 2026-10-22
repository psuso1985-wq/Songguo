#!/usr/bin/env node
// Operator-only native NocoBase key provisioning. No key is printed, and the
// browser/runtime never falls back to root. Run with the bootstrap environment.
import { randomBytes } from 'node:crypto';
import { open, mkdir, lstat, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ensureWorkspaceServiceAcl,
  restoreWorkspaceServiceAcl,
  snapshotWorkspaceServiceAcl,
  workspaceRole,
} from './apply-workspace-service-acl.mjs';

const exists = (path) => lstat(path).then(() => true, (error) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const errorText = (error) => String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, ' ').slice(0, 240);
const sameStringArray = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || []);

export function compensationPathFor(target) {
  return resolve(dirname(target), `.${basename(target)}.compensation.json`);
}

async function writeJsonAtomically(target, value) {
  const temporary = resolve(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  let closed = false;
  try {
    await file.writeFile(JSON.stringify(value) + '\n');
    await file.sync();
    await file.close();
    closed = true;
    await rename(temporary, target);
  } catch (error) {
    if (!closed) await file.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function stageCredentialOutput(target, key) {
  if (typeof key !== 'string' || !key || /[\r\n]/.test(key)) throw new Error('Native key issuance returned an invalid key');
  const temporary = resolve(dirname(target), `.${basename(target)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  const file = await open(temporary, 'wx', 0o600);
  let closed = false;
  try {
    await file.writeFile('NOCOBASE_WORKSPACE_API_TOKEN=' + key + '\n');
    await file.sync();
    await file.close();
    closed = true;
    if ((await stat(temporary)).size <= 'NOCOBASE_WORKSPACE_API_TOKEN=\n'.length) throw new Error('Staged key file validation failed');
  } catch (error) {
    if (!closed) await file.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return temporary;
}

export function resolveIssuedApiKey(createResult, listedRows, expectedName) {
  const key = createResult?.data?.token || createResult?.token;
  const exact = (listedRows || []).filter((row) => row?.name === expectedName && row?.id != null);
  if (typeof key !== 'string' || !key || exact.length !== 1) {
    throw new Error('Native key issuance returned no uniquely verifiable key record');
  }
  return { id: exact[0].id, key };
}

async function rollbackStep(failures, label, action) {
  try {
    await action();
  } catch (error) {
    failures.push(`${label}: ${errorText(error)}`);
  }
}

// Kept dependency-injected so failure paths can be verified without a server or
// a real credential. Commit is the final operation; every earlier mutation has
// a compensating action and the staged file is never the requested output path.
export async function runProvisionTransaction(ops) {
  let aclSnapshot;
  let userState;
  let issued;
  let staged;
  let committed = false;
  try {
    aclSnapshot = await ops.snapshotAcl();
    await ops.ensurePlugin();
    await ops.applyAcl();
    userState = await ops.snapshotUser();
    userState.user = await ops.prepareUser(userState);
    await ops.prepareIssuer(userState.user, userState);
    issued = await ops.issueKey(userState.user, userState);
    await ops.verifyIssuedKey(issued, userState);
    staged = await ops.stageKey(issued.key);
    await ops.verifyServiceUser(userState.user);
    await ops.restoreIssuer(userState);
    await ops.commitKey(staged);
    staged = undefined;
    committed = true;
    await ops.clearCompensation(userState);
    return issued;
  } catch (error) {
    const failures = [];
    if (staged) await rollbackStep(failures, 'staged output cleanup', () => ops.cleanupStaged(staged));
    if (committed) await rollbackStep(failures, 'committed output cleanup', () => ops.cleanupCommitted());
    if (userState) await rollbackStep(failures, 'issued key revocation', () => ops.cleanupIssuedKey(userState, issued));
    if (userState) await rollbackStep(failures, 'issuer ACL restore', () => ops.restoreIssuer(userState));
    if (userState) await rollbackStep(failures, 'service user restore', () => ops.restoreUser(userState));
    if (aclSnapshot) await rollbackStep(failures, 'workspace ACL restore', () => ops.restoreAcl(aclSnapshot));
    await rollbackStep(failures, 'API Keys plugin restore', () => ops.restorePlugin());
    if (userState && failures.length === 0) await rollbackStep(failures, 'compensation record cleanup', () => ops.clearCompensation(userState));
    if (failures.length) throw new Error(`${errorText(error) || 'Provisioning failed'}; rollback incomplete: ${failures.join(', ')}`);
    throw error;
  }
}

function roleNames(user) {
  return [...new Set((user.roles || []).map((role) => typeof role === 'string' ? role : role?.name).filter(Boolean))];
}

export async function provisionWorkspaceService({
  base,
  output,
  rootEmail,
  rootPassword,
  fetchImpl = fetch,
  wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms)),
  afterIssuedKeyProbe = async () => {},
}) {
  if (!base || !output || !rootEmail || !rootPassword) throw new Error('Set NOCOBASE_URL and root bootstrap credentials; provide a protected output filename.');
  const target = resolve(output);
  const compensation = compensationPathFor(target);
  // Refuse overwrite/symlink before changing any existing identity/password.
  if (await exists(target)) throw new Error('Output already exists. Choose a new protected filename for key rotation.');
  if (await exists(compensation)) throw new Error('An unresolved provisioning compensation record exists for this output.');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  let root;
  async function request(path, options = {}) {
    const url = new URL(base.replace(/\/$/, '') + '/api/' + path);
    for (const [name, value] of Object.entries(options.query || {})) url.searchParams.set(name, value);
    const token = options.token || root;
    const result = await fetchImpl(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Authenticator': 'basic',
        ...(token ? { Authorization: 'Bearer ' + token, 'X-Role': options.role || 'root' } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!result.ok) throw new Error(path + ' rejected: HTTP ' + result.status);
    return result.json();
  }
  root = (await request('auth:signIn', { method: 'POST', body: { account: rootEmail, password: rootPassword } })).data?.token;
  if (!root) throw new Error('Bootstrap login failed');
  const listMeta = async () => (await request('collections:listMeta', { method: 'POST', body: {} })).data;
  let enabledByProvision = false;
  await runProvisionTransaction({
    snapshotAcl: () => snapshotWorkspaceServiceAcl({ request }),
    applyAcl: () => ensureWorkspaceServiceAcl({ request, listMeta }),
    restoreAcl: (snapshot) => restoreWorkspaceServiceAcl({ request, snapshot }),
    ensurePlugin: async () => {
      const plugins = (await request('pm:list')).data;
      if (!plugins) throw new Error('Cannot inspect native API Keys capability');
      try { await request('apiKeys:list'); return false; } catch { /* enable packaged plugin */ }
      await request('pm:enable', { method: 'POST', query: { filterByTk: 'api-keys' }, body: {} });
      enabledByProvision = true;
      for (let attempt = 0; attempt < 30; attempt++) {
        await wait(1000);
        try { await request('apiKeys:list'); return true; } catch { /* application restart */ }
      }
      throw new Error('Native API Keys plugin did not become ready');
    },
    restorePlugin: async () => {
      if (!enabledByProvision) return;
      await request('pm:disable', { method: 'POST', query: { filterByTk: 'api-keys' }, body: {} });
      for (let attempt = 0; attempt < 30; attempt++) {
        await wait(1000);
        try {
          await request('pm:list');
          try {
            await request('apiKeys:list');
          } catch {
            return;
          }
        } catch { /* application restart */ }
      }
      throw new Error('Native API Keys plugin disable could not be verified');
    },
    snapshotUser: async () => {
      // A fresh bridge identity keeps rotation transactional: changing an
      // existing user's password would invalidate its old key before the new
      // output is committed, and password hashes cannot be restored safely.
      const username = 'sg_workspace_bridge_' + randomBytes(8).toString('hex');
      const password = randomBytes(32).toString('base64url');
      const email = username + '@example.invalid';
      const user = (await request('users:list', { query: { paginate: 'false', 'filter[username]': username } })).data?.[0] || null;
      if (user) throw new Error('Generated service user already exists');
      return {
        username,
        email,
        password,
        apiKeyName: `Songguo Workspace V1 ${new Date().toISOString()} ${randomBytes(8).toString('hex')}`,
        compensation,
      };
    },
    prepareUser: async (state) => {
      const user = (await request('users:create', {
        method: 'POST',
        body: { username: state.username, email: state.email, nickname: 'Workspace bridge', password: state.password, roles: [workspaceRole] },
      })).data;
      if (!user?.id) throw new Error('Service user preparation returned no user');
      return { ...user, email: state.email, password: state.password };
    },
    restoreUser: async (state) => {
      const user = (await request('users:list', { query: { paginate: 'false', 'filter[username]': state.username } })).data?.[0];
      if (user) await request('users:destroy', { method: 'POST', query: { filterByTk: user.id } });
    },
    prepareIssuer: async (_user, state) => {
      const role = (await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data?.[0];
      if (!role) throw new Error('Workspace service role is unavailable for native key issuance');
      state.originalSnippets = [...(role.snippets || [])];
      state.issuerSnippets = [...new Set(state.originalSnippets.filter((name) => name !== '!pm' && name !== '!pm.*').concat('pm.api-keys.configuration'))];
      await request('roles:update', { method: 'POST', query: { filterByTk: workspaceRole }, body: { snippets: state.issuerSnippets } });
      state.issuerWasPrepared = true;
      const readback = (await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data?.[0];
      if (!sameStringArray(readback?.snippets, state.issuerSnippets)) throw new Error('Temporary API Keys permission could not be verified');
    },
    restoreIssuer: async (state) => {
      if (!state.issuerWasPrepared || !state.originalSnippets) return;
      await request('roles:update', { method: 'POST', query: { filterByTk: workspaceRole }, body: { snippets: state.originalSnippets } });
      const readback = (await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data?.[0];
      if (!sameStringArray(readback?.snippets, state.originalSnippets)) throw new Error('API Keys permission restoration readback differed');
      state.issuerWasPrepared = false;
    },
    issueKey: async (user, state) => {
      await wait(2100); // native passwordChangedAt can be more precise than JWT iat
      const token = (await request('auth:signIn', { method: 'POST', body: { account: user.email, password: user.password } })).data?.token;
      if (!token) throw new Error('Service user sign-in returned no token');
      state.sessionToken = token;
      await writeJsonAtomically(compensation, {
        version: 1,
        username: state.username,
        userId: user.id,
        sessionToken: token,
        apiKeyName: state.apiKeyName,
        createdAt: new Date().toISOString(),
      });
      state.compensationPersisted = true;
      state.apiKeyCreateAttempted = true;
      const result = await request('apiKeys:create', {
        token,
        role: workspaceRole,
        method: 'POST',
        body: { name: state.apiKeyName, role: { name: workspaceRole }, expiresIn: '365d' },
      });
      const rows = (await request('apiKeys:list', {
        token,
        role: workspaceRole,
        query: { paginate: 'false', 'filter[name]': state.apiKeyName },
      })).data || [];
      const issued = resolveIssuedApiKey(result, rows, state.apiKeyName);
      state.issuedKeyId = issued.id;
      return issued;
    },
    cleanupIssuedKey: async (state) => {
      if (!state.sessionToken || !state.apiKeyCreateAttempted) return;
      if (!state.issuerWasPrepared) {
        await request('roles:update', { method: 'POST', query: { filterByTk: workspaceRole }, body: { snippets: state.issuerSnippets } });
        const role = (await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data?.[0];
        if (!sameStringArray(role?.snippets, state.issuerSnippets)) throw new Error('Temporary API Keys cleanup permission could not be verified');
        state.issuerWasPrepared = true;
      }
      const list = async () => ((await request('apiKeys:list', {
        token: state.sessionToken,
        role: workspaceRole,
        query: { paginate: 'false', 'filter[name]': state.apiKeyName },
      })).data || []).filter((row) => row?.name === state.apiKeyName);
      for (const row of await list()) {
        if (row.id == null) throw new Error('Created key lookup returned a record without id');
        await request('apiKeys:destroy', {
          token: state.sessionToken,
          role: workspaceRole,
          method: 'POST',
          query: { filterByTk: row.id },
          body: {},
        });
      }
      if ((await list()).length) throw new Error('Created key remained after compensating revocation');
    },
    verifyIssuedKey: async (issued, state) => {
      await request('workspaces:list', {
        token: issued.key,
        role: workspaceRole,
        query: { paginate: 'false', pageSize: '1' },
      });
      await afterIssuedKeyProbe({ id: issued.id, apiKeyName: state.apiKeyName });
    },
    stageKey: (key) => stageCredentialOutput(target, key),
    cleanupStaged: (temporary) => rm(temporary, { force: true }),
    cleanupCommitted: () => rm(target, { force: true }),
    verifyServiceUser: async (user) => {
      const read = (await request('users:list', { query: { paginate: 'false', appends: 'roles', 'filter[id]': user.id } })).data?.[0];
      const roles = roleNames(read || {});
      if (roles.length !== 1 || roles[0] !== workspaceRole) throw new Error('Service user least-privilege role could not be verified');
    },
    clearCompensation: async (state) => {
      if (!state.compensationPersisted) return;
      await rm(compensation);
      state.compensationPersisted = false;
    },
    commitKey: (temporary) => rename(temporary, target),
  });
  return target;
}

async function main() {
  await provisionWorkspaceService({
    base: process.env.NOCOBASE_URL || '',
    output: process.argv[2],
    rootEmail: process.env.INIT_ROOT_EMAIL,
    rootPassword: process.env.INIT_ROOT_PASSWORD,
  });
  console.log('Workspace service provisioned. Key saved atomically to protected output; service has no administrative role.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
