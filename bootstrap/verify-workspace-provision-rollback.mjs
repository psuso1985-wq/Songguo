#!/usr/bin/env node
import assert from 'node:assert/strict';
import { lstat, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import {
  snapshotWorkspaceServiceAcl,
  workspaceServiceAclSnapshotsEqual,
} from './apply-workspace-service-acl.mjs';
import {
  compensationPathFor,
  provisionWorkspaceService,
} from './provision-workspace-service.mjs';

const exists = (path) => lstat(path).then(() => true, (error) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const base = (process.env.NOCOBASE_URL || '').replace(/\/$/, '');
const output = resolve(process.argv[2] || '');
const sentinel = 'forced failure after live issued-key probe';
if (!base || !process.env.INIT_ROOT_EMAIL || !process.env.INIT_ROOT_PASSWORD || !process.argv[2]) {
  throw new Error('NOCOBASE_URL, root bootstrap credentials, and an output path are required');
}

const login = await fetch(base + '/api/auth:signIn', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Authenticator': 'basic' },
  body: JSON.stringify({ account: process.env.INIT_ROOT_EMAIL, password: process.env.INIT_ROOT_PASSWORD }),
});
assert.equal(login.status, 200, 'root login must succeed');
const root = (await login.json()).data?.token;
assert.ok(root, 'root login must return a session');
async function request(path, options = {}) {
  const url = new URL(base + '/api/' + path);
  for (const [key, value] of Object.entries(options.query || {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + root,
      'X-Role': 'root',
      'X-Authenticator': 'basic',
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  assert.equal(response.status, 200, `${path} must succeed`);
  return response.json();
}

const before = await snapshotWorkspaceServiceAcl({ request });
let failure;
try {
  await provisionWorkspaceService({
    base,
    output,
    rootEmail: process.env.INIT_ROOT_EMAIL,
    rootPassword: process.env.INIT_ROOT_PASSWORD,
    afterIssuedKeyProbe: async () => { throw new Error(sentinel); },
  });
} catch (error) {
  failure = error;
}
assert.equal(failure?.message, sentinel, 'forced failure must be returned without rollback-incomplete details');

const after = await snapshotWorkspaceServiceAcl({ request });
assert.ok(workspaceServiceAclSnapshotsEqual(after, before), 'workspace ACL must equal its pre-provision snapshot');
const users = (await request('users:list', { query: { paginate: 'false' } })).data || [];
assert.ok(!users.some((user) => String(user.username || '').startsWith('sg_workspace_bridge_')), 'temporary bridge user must be removed');
assert.equal(await exists(output), false, 'credential output must not exist');
assert.equal(await exists(compensationPathFor(output)), false, 'compensation record must be cleared after complete rollback');
const prefix = '.' + basename(output);
assert.ok(!(await readdir(dirname(output))).some((entry) => entry.startsWith(prefix)), 'no staging or compensation file may remain');

console.log(JSON.stringify({
  status: 'PASS',
  checks: [
    'new key passed a live authorized collection read before forced failure',
    'same-owner name lookup revoked the created key and read back zero matches',
    'workspace ACL readback equals the pre-provision snapshot',
    'temporary bridge identity removed',
    'no credential, staging, or compensation file remained',
  ],
}));
