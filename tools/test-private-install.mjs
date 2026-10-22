// Installer safety/failure tests; never invokes a real Docker mutation.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'tools/private-install.mjs');
const name = `guard-${randomBytes(5).toString('hex')}`;
const dir = join(root, '.private-install', name);
const sandbox = await mkdtemp(join(tmpdir(), 'songguo-installer-'));
const commandLog = join(sandbox, 'commands.jsonl');
const fake = join(sandbox, 'docker');
await writeFile(fake, `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify(args)+'\\n');
if (args.includes('context')) console.log('unix:///var/run/docker.sock');
else if (args.includes('ps') && args.includes('-aq')) console.log(process.env.TEST_FOREIGN ? 'foreign-id' : '');
else if (args.includes('inspect')) console.log(JSON.stringify([{Config:{Labels:{'io.songguo.private-instance':'foreign-instance'}},Mounts:[]}]));
else if (args.includes('config') && process.env.TEST_FAIL_CONFIG) {console.error('fixture failure '+process.env.APP_KEY);process.exit(7);}
else if (args.includes('/bootstrap/apply-phase-1.mjs') || (args.includes('run') && args.includes('bootstrap'))) {console.error('fixture bootstrap failure');process.exit(9);}
`, { mode: 0o700 });
async function run(args, extra = {}) {
  return new Promise((yes, no) => {
    const p = spawn(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, PATH: sandbox + ':' + process.env.PATH, TEST_COMMAND_LOG: commandLog, ...extra } });
    let text = ''; p.stdout.on('data', (b) => { text += b; }); p.stderr.on('data', (b) => { text += b; });
    p.on('error', no); p.on('exit', (code) => yes({ code, text }));
  });
}
const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const commands = async () => (await readFile(commandLog, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
async function freePort() {
  const s = createServer(); await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port; await new Promise((r) => s.close(r)); return port;
}
try {
  let webPort = await freePort(), backendPort = await freePort();
  while (webPort < 20000 || webPort > 59999) webPort = await freePort();
  while (backendPort < 20000 || backendPort > 59999 || backendPort === webPort) backendPort = await freePort();
  await test('rejects path traversal and reserved/outside port configuration', async () => {
    assert.notEqual((await run(['init', '../outside'])).code, 0);
    assert.notEqual((await run(['init', name, '5432', '5432'])).code, 0);
  });
  await test('init refuses overwrite and preserves existing keys/config', async () => {
    assert.equal((await run(['init', name, String(webPort), String(backendPort)])).code, 0);
    const env = join(dir, 'instance.env'), key = join(dir, 'secrets/workspace-session.key');
    const before = [await digest(env), await digest(key)];
    assert.notEqual((await run(['init', name, String(webPort), String(backendPort)])).code, 0);
    assert.deepEqual([await digest(env), await digest(key)], before);
  });
  await test('rejects unexpected environment configuration before Docker', async () => {
    const env = join(dir, 'instance.env'), saved = await readFile(env);
    await writeFile(env, Buffer.concat([saved, Buffer.from('DB_HOST=old-instance\n')]));
    try { assert.match((await run(['check', name])).text, /Unexpected instance configuration keys/); }
    finally { await writeFile(env, saved); }
  });
  await test('rejects secret symlinks, unresolved compensation and concurrent runs', async () => {
    const credential = join(dir, 'secrets/workspace-service.env');
    await symlink(join(dir, 'instance.env'), credential);
    assert.match((await run(['check', name])).text, /Expected regular file/); await unlink(credential);
    const compensation = join(dir, 'secrets/.workspace-service.env.compensation.json');
    await writeFile(compensation, '{}', { mode: 0o600 });
    assert.match((await run(['check', name])).text, /Unresolved service provisioning/); await unlink(compensation);
    const lock = join(dir, '.installer.lock'); await writeFile(lock, '', { mode: 0o600 });
    assert.notEqual((await run(['install', name])).code, 0); await unlink(lock);
  });
  await test('foreign Compose project fails before any Compose mutation', async () => {
    await writeFile(commandLog, '');
    assert.match((await run(['install', name], { TEST_FOREIGN: '1' })).text, /project collision/);
    assert.ok(!(await commands()).some((a) => a.includes('compose')));
  });
  await test('configuration failure stops installation and redacts secrets in logs', async () => {
    await writeFile(commandLog, '');
    const result = await run(['install', name], { TEST_FAIL_CONFIG: '1' });
    assert.notEqual(result.code, 0); assert.ok(!(await commands()).some((a) => a.includes('up')));
    const file = result.text.match(/logs\/([^\s]+\.log)/)?.[1]; assert.ok(file);
    const text = await readFile(join(dir, 'logs', file), 'utf8');
    const secret = (await readFile(join(dir, 'instance.env'), 'utf8')).match(/^APP_KEY=(.+)$/m)[1];
    assert.ok(!text.includes(secret) && text.includes('[REDACTED]'));
  });
  await test('bootstrap failure stops before provisioning, schema guard, build or web', async () => {
    const server = createServer((_, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"data":{"token":"fixture-only"}}'); });
    await new Promise((r) => server.listen(backendPort, '127.0.0.1', r));
    // The mock reports an owned running NocoBase so port ownership is valid.
    const saved = await readFile(fake, 'utf8');
    const marker = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8'));
    await writeFile(fake, saved.replace("process.env.TEST_FOREIGN ? 'foreign-id' : ''", "'owned-id'")
      .replace("'foreign-instance'", JSON.stringify(marker.id))
      .replace("'io.songguo.private-instance':", "'com.docker.compose.service':'nocobase','io.songguo.private-instance':")
      .replace('Mounts:[]', 'Mounts:[],State:{Running:true}'));
    try {
      await writeFile(commandLog, '');
      const result = await run(['install', name]); assert.notEqual(result.code, 0);
      assert.match(result.text, /bootstrap failed/);
      const all = await commands();
      assert.ok(all.some((a) => a.includes('bootstrap')));
      assert.ok(!all.some((a) => a.includes('schema-guard') || a.includes('build') || a.includes('web') || a.some((s) => s.includes('provision-workspace'))));
    } finally { await new Promise((r) => server.close(r)); await writeFile(fake, saved); }
  });
} finally {
  // Only directories created by this test; no Docker volumes/services exist.
  await rm(dir, { recursive: true, force: true }); await rm(sandbox, { recursive: true, force: true });
}
