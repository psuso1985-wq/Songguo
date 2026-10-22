import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveIssuedApiKey,
  runProvisionTransaction,
  stageCredentialOutput,
} from '../../bootstrap/provision-workspace-service.mjs';

const name = 'Songguo Workspace V1 unique';
assert.deepEqual(
  resolveIssuedApiKey({ data: { token: 'token-only-response' } }, [{ id: 42, name }], name),
  { id: 42, key: 'token-only-response' },
  'token-only create responses must be joined to the same-owner name lookup',
);
assert.throws(
  () => resolveIssuedApiKey({ data: { token: 'ambiguous' } }, [{ id: 1, name }, { id: 2, name }], name),
  /uniquely verifiable/,
  'an ambiguous name lookup must never be accepted',
);

const directory = await mkdtemp(join(tmpdir(), 'songguo-workspace-provision-'));
try {
  const earlyRollback = [];
  await assert.rejects(runProvisionTransaction({
    snapshotAcl: async () => ({ before: true }),
    applyAcl: async () => { throw new Error('forced partial ACL failure'); },
    restoreAcl: async () => { earlyRollback.push('acl'); },
    ensurePlugin: async () => false,
    restorePlugin: async () => { earlyRollback.push('plugin'); },
    snapshotUser: async () => { throw new Error('must not reach user preparation'); },
  }), /forced partial ACL failure/);
  assert.deepEqual(earlyRollback, ['acl', 'plugin'], 'a partial ACL failure must restore ACL before disabling the plugin that can restart the application');

  const failedTarget = join(directory, 'failed.env');
  const rollback = [];
  await assert.rejects(runProvisionTransaction({
    snapshotAcl: async () => ({ before: true }), applyAcl: async () => {}, restoreAcl: async () => { rollback.push('acl'); },
    ensurePlugin: async () => true, restorePlugin: async () => { rollback.push('plugin'); },
    snapshotUser: async () => ({ compensationPersisted: true }), prepareUser: async () => ({ id: 1 }), restoreUser: async () => { rollback.push('user'); },
    prepareIssuer: async () => {}, restoreIssuer: async () => { rollback.push('issuer'); },
    issueKey: async () => ({ id: 2, key: 'test-key-not-a-real-credential' }), cleanupIssuedKey: async () => { rollback.push('key'); },
    verifyIssuedKey: async () => {},
    stageKey: (key) => stageCredentialOutput(failedTarget, key), cleanupStaged: async (path) => { rollback.push('file'); await rm(path, { force: true }); },
    cleanupCommitted: async () => { rollback.push('committed'); await rm(failedTarget, { force: true }); },
    verifyServiceUser: async () => { throw new Error('forced service-user verification failure'); },
    clearCompensation: async () => { rollback.push('compensation'); },
    commitKey: (path) => rename(path, failedTarget),
  }), /forced service-user verification failure/);
  assert.deepEqual(rollback, ['file', 'key', 'issuer', 'user', 'acl', 'plugin', 'compensation'], 'failure must compensate in reverse order and clear its journal last');
  assert.ok(!(await readdir(directory)).some((entry) => entry.includes('failed.env')), 'failure must leave neither target nor temporary file');

  const commitTarget = join(directory, 'commit-failed.env');
  const lateRollback = [];
  await assert.rejects(runProvisionTransaction({
    snapshotAcl: async () => ({}), applyAcl: async () => {}, restoreAcl: async () => { lateRollback.push('acl'); },
    ensurePlugin: async () => false, restorePlugin: async () => { lateRollback.push('plugin'); },
    snapshotUser: async () => ({}), prepareUser: async () => ({ id: 1 }), restoreUser: async () => { lateRollback.push('user'); },
    prepareIssuer: async () => {}, restoreIssuer: async () => { lateRollback.push('issuer'); },
    issueKey: async () => ({ id: 2, key: 'test-key-not-a-real-credential' }), cleanupIssuedKey: async () => { lateRollback.push('key'); },
    verifyIssuedKey: async () => {}, verifyServiceUser: async () => {},
    stageKey: (key) => stageCredentialOutput(commitTarget, key), cleanupStaged: (path) => rm(path, { force: true }),
    cleanupCommitted: async () => { lateRollback.push('committed'); await rm(commitTarget, { force: true }); },
    commitKey: (path) => rename(path, commitTarget),
    clearCompensation: async () => { throw new Error('forced journal cleanup failure'); },
  }), /forced journal cleanup failure/);
  assert.deepEqual(lateRollback, ['issuer', 'committed', 'key', 'issuer', 'user', 'acl', 'plugin'], 'a post-commit failure must remove the committed file and roll back remote state');
  assert.ok(!(await readdir(directory)).includes('commit-failed.env'));

  const successTarget = join(directory, 'success.env');
  const successOrder = [];
  await runProvisionTransaction({
    snapshotAcl: async () => ({}), applyAcl: async () => {}, restoreAcl: async () => {},
    ensurePlugin: async () => false, restorePlugin: async () => {},
    snapshotUser: async () => ({}), prepareUser: async () => ({ id: 1 }), restoreUser: async () => {},
    prepareIssuer: async () => { successOrder.push('issuer-prepared'); }, restoreIssuer: async () => { successOrder.push('issuer-restored'); },
    issueKey: async () => ({ id: 2, key: 'test-key-not-a-real-credential' }), cleanupIssuedKey: async () => {},
    verifyIssuedKey: async () => { successOrder.push('key-probed'); },
    stageKey: (key) => stageCredentialOutput(successTarget, key), cleanupStaged: (path) => rm(path, { force: true }),
    cleanupCommitted: () => rm(successTarget, { force: true }),
    verifyServiceUser: async () => { successOrder.push('user-verified'); },
    commitKey: async (path) => { await rename(path, successTarget); successOrder.push('committed'); },
    clearCompensation: async () => { successOrder.push('journal-cleared'); },
  });
  assert.deepEqual(successOrder, ['issuer-prepared', 'key-probed', 'user-verified', 'issuer-restored', 'committed', 'journal-cleared']);
  assert.match(await readFile(successTarget, 'utf8'), /^NOCOBASE_WORKSPACE_API_TOKEN=[^\r\n]+\n$/);
  assert.deepEqual(await readdir(directory), ['success.env'], 'success must atomically expose only the final file');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Workspace service provisioning failure-path tests passed.');
