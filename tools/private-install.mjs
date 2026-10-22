#!/usr/bin/env node
// Local, private candidates only. Never loads the inherited .env/Compose stack.
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat, realpath, readdir, open, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stateRoot = join(root, '.private-install');
const serviceRole = 'songguo-workspace-service';
const secretNames = ['APP_KEY', 'POSTGRES_PASSWORD', 'INIT_ROOT_PASSWORD', 'AISYS_CREDENTIAL_PEPPER'];
const exists = async (p) => lstat(p).then(() => true, (e) => { if (e.code === 'ENOENT') return false; throw e; });
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function validateName(name) {
  assert(/^[a-z][a-z0-9-]{0,31}$/.test(name || ''), 'Instance must match [a-z][a-z0-9-]{0,31}');
  return name;
}
export function validatePorts(web, backend) {
  assert([web, backend].every((p) => Number.isInteger(p) && p >= 20000 && p <= 59999) && web !== backend,
    'Use distinct unprivileged ports between 20000 and 59999');
}
export function parseConfig(text) {
  const entries = text.trim().split('\n').map((line) => {
    const match = /^([A-Z_]+)=([A-Za-z0-9@._-]+)$/.exec(line);
    assert(match, 'Invalid protected instance configuration; shell syntax is not accepted');
    return match.slice(1);
  });
  assert(new Set(entries.map(([k]) => k)).size === entries.length, 'Duplicate instance configuration key');
  const config = Object.fromEntries(entries);
  assert(Object.keys(config).sort().join() === [...secretNames, 'INIT_ROOT_EMAIL'].sort().join(), 'Unexpected instance configuration keys');
  for (const name of secretNames) assert(/^[a-f0-9]{64}$/.test(config[name]), `Invalid ${name}; do not replace existing secrets`);
  assert(/^installer-[a-f0-9-]+@example\.invalid$/.test(config.INIT_ROOT_EMAIL), 'Only an isolated installer admin is supported');
  return config;
}
async function regular(path, privateFile = false) {
  const stat = await lstat(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `Expected regular file: ${path}`);
  if (privateFile) assert((stat.mode & 0o077) === 0, `Expected owner-only permissions: ${path}`);
}
async function safeDir(path) {
  const stat = await lstat(path);
  assert(stat.isDirectory() && !stat.isSymbolicLink() && await realpath(path) === path, `Unsafe instance directory: ${path}`);
}
async function available(port) {
  await new Promise((yes, no) => {
    const server = createServer();
    server.once('error', () => no(new Error(`Loopback port ${port} is occupied; nothing was stopped`)));
    server.listen(port, '127.0.0.1', () => server.close(yes));
  });
}
async function createInstance(name, webPort, backendPort) {
  validateName(name); validatePorts(webPort, backendPort);
  await available(webPort); await available(backendPort);
  await mkdir(stateRoot, { recursive: true, mode: 0o700 }); await safeDir(stateRoot);
  const dir = join(stateRoot, name);
  await mkdir(dir, { mode: 0o700 }); // EEXIST is intentional: never adopts old data.
  for (const sub of ['secrets', 'logs', 'postgres', 'nocobase', 'backups']) await mkdir(join(dir, sub), { mode: 0o700 });
  const id = randomUUID();
  const metadata = { version: 1, name, id, root, webPort, backendPort, project: `songguo-private-${name}` };
  const config = Object.fromEntries(secretNames.map((key) => [key, randomBytes(32).toString('hex')]));
  config.INIT_ROOT_EMAIL = `installer-${id}@example.invalid`;
  await writeFile(join(dir, 'instance.env'), Object.entries(config).map(([k, v]) => `${k}=${v}\n`).join(''), { flag: 'wx', mode: 0o600 });
  await writeFile(join(dir, 'secrets/workspace-session.key'), randomBytes(32), { flag: 'wx', mode: 0o600 });
  // Write marker last: interrupted creation is never mistaken for a valid instance.
  await writeFile(join(dir, 'instance.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(`Created isolated instance ${name}; no containers started, no secrets printed.`);
}
async function load(name) {
  validateName(name);
  const dir = join(stateRoot, name);
  await safeDir(stateRoot); await safeDir(dir);
  for (const sub of ['secrets', 'logs', 'postgres', 'nocobase', 'backups']) await safeDir(join(dir, sub));
  for (const file of ['instance.json', 'instance.env', 'secrets/workspace-session.key']) await regular(join(dir, file), true);
  const meta = JSON.parse(await readFile(join(dir, 'instance.json'), 'utf8'));
  assert(meta.version === 1 && meta.root === root && meta.name === name && meta.project === `songguo-private-${name}` && /^[a-f0-9-]{36}$/.test(meta.id), 'Instance marker does not match this checkout');
  validatePorts(meta.webPort, meta.backendPort);
  assert((await readFile(join(dir, 'secrets/workspace-session.key'))).length === 32, 'Invalid session key; never regenerate it on an existing instance');
  const config = parseConfig(await readFile(join(dir, 'instance.env'), 'utf8'));
  assert(config.INIT_ROOT_EMAIL === `installer-${meta.id}@example.invalid`, 'Instance admin identity mismatch');
  const serviceFile = join(dir, 'secrets/workspace-service.env');
  assert(!(await exists(join(dir, 'secrets/.workspace-service.env.compensation.json'))), 'Unresolved service provisioning compensation record; reconcile it before retrying');
  let serviceToken;
  if (await exists(serviceFile)) {
    await regular(serviceFile, true);
    const match = /^NOCOBASE_WORKSPACE_API_TOKEN=([^\s]+)\n?$/.exec(await readFile(serviceFile, 'utf8'));
    assert(match, 'Invalid existing service credential file; refusing rotation');
    serviceToken = match[1];
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(COMPOSE_|DOCKER_|BUILDX_|PRIVATE_|APP_COMMIT$)/.test(k) && ![...secretNames, 'INIT_ROOT_EMAIL', 'NOCOBASE_WORKSPACE_API_TOKEN'].includes(k)));
  Object.assign(env, config, { PRIVATE_INSTANCE_DIR: dir, PRIVATE_INSTANCE_ID: meta.id, PRIVATE_PROJECT: meta.project,
    PRIVATE_UID: String(process.getuid()), PRIVATE_GID: String(process.getgid()),
    PRIVATE_WEB_PORT: String(meta.webPort), PRIVATE_BACKEND_PORT: String(meta.backendPort), PRIVATE_WEB_IMAGE: `songguo-private-web:${name}`, APP_COMMIT: 'private-candidate' });
  return { dir, meta, config, serviceToken, env, run: `${Date.now()}-${randomBytes(3).toString('hex')}` };
}
async function command(ctx, program, args, logName) {
  const output = await new Promise((yes, no) => {
    const child = spawn(program, args, { cwd: root, env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (b) => { out += b; }); child.stderr.on('data', (b) => { err += b; });
    child.on('error', no); child.on('exit', (code) => yes({ code, out, err }));
  });
  if (logName) {
    let text = output.out + output.err;
    for (const secret of [...secretNames.map((k) => ctx.config[k]), ctx.serviceToken, ctx.env.HTTP_PROXY, ctx.env.HTTPS_PROXY].filter(Boolean)) text = text.split(secret).join('[REDACTED]');
    text = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]');
    await writeFile(join(ctx.dir, 'logs', `${ctx.run}-${logName}.log`), text, { mode: 0o600, flag: 'wx' });
  }
  assert(output.code === 0, `${logName || program} failed (exit ${output.code}); stopped. ${logName ? 'See protected instance logs/' + ctx.run + '-' + logName + '.log.' : 'No state was reset.'}`);
  return output.out;
}
const docker = (ctx, args, log) => command(ctx, 'docker', ['--context', 'default', ...args], log);
const compose = (ctx, args, log) => docker(ctx, ['compose', '--project-directory', root, '--env-file', join(ctx.dir, 'instance.env'), '-f', join(root, 'compose.private-install.yml'), '-p', ctx.meta.project, ...args], log);
async function ownership(ctx) {
  const endpoint = (await docker(ctx, ['context', 'inspect', 'default', '--format', '{{.Endpoints.docker.Host}}'])).trim();
  assert(endpoint === 'unix:///var/run/docker.sock', 'Installer only supports the local default Unix Docker engine');
  const ids = (await docker(ctx, ['ps', '-aq', '--filter', `label=com.docker.compose.project=${ctx.meta.project}`])).trim().split(/\s+/).filter(Boolean);
  const containers = ids.length ? JSON.parse(await docker(ctx, ['inspect', ...ids])) : [];
  for (const container of containers) {
    const labels = container.Config.Labels;
    assert(labels['io.songguo.private-instance'] === ctx.meta.id, 'Compose project collision: foreign container; nothing stopped');
    for (const mount of container.Mounts || []) {
      const allowed = [ctx.dir + '/', root + '/bootstrap'];
      assert(mount.Type === 'bind' && allowed.some((prefix) => prefix.endsWith('/') ? mount.Source.startsWith(prefix) : mount.Source === prefix), 'Foreign container mount; refusing to use this instance');
    }
  }
  const nets = (await docker(ctx, ['network', 'ls', '-q', '--filter', `label=com.docker.compose.project=${ctx.meta.project}`])).trim().split(/\s+/).filter(Boolean);
  if (nets.length) for (const net of JSON.parse(await docker(ctx, ['network', 'inspect', ...nets]))) assert(net.Labels['io.songguo.private-instance'] === ctx.meta.id, 'Foreign Compose network; refusing adoption');
  for (const [service, port] of [['web', ctx.meta.webPort], ['nocobase', ctx.meta.backendPort]]) {
    if (!containers.some((c) => c.Config.Labels['com.docker.compose.service'] === service && c.State.Running)) await available(port);
  }
  if (!containers.length) {
    assert((await readdir(join(ctx.dir, 'postgres'))).length === 0 && (await readdir(join(ctx.dir, 'nocobase'))).length === 0,
      'Existing data without matching containers; explicit recovery is required, no automatic adoption');
  }
}
async function native(ctx, path, token, body) {
  const response = await fetch(`http://127.0.0.1:${ctx.meta.backendPort}/api/${path}`, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'X-Authenticator': 'basic', ...(token ? { Authorization: `Bearer ${token}`, 'X-Role': serviceRole } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return response;
}
async function backendReady(ctx) {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    try {
      const r = await native(ctx, 'auth:signIn', null, { account: ctx.config.INIT_ROOT_EMAIL, password: ctx.config.INIT_ROOT_PASSWORD });
      if (r.ok && (await r.json()).data?.token) return;
    } catch { /* startup can close sockets */ }
    await sleep(3000);
  }
  throw new Error('NocoBase did not accept this instance bootstrap identity within 10 minutes; inspect its local logs');
}
async function verifyService(ctx) {
  assert(ctx.serviceToken, 'Missing restricted service credential');
  assert((await native(ctx, 'workspaces:list', ctx.serviceToken)).status === 200, 'Restricted service cannot read workspaces');
  for (const path of ['users:list', 'roles:list', 'pm:list']) assert((await native(ctx, path, ctx.serviceToken)).status === 403, `Service administrative boundary failed at ${path}`);
  assert((await native(ctx, 'project_reports:update?filterByTk=-1', ctx.serviceToken, { summary: 'forbidden installer probe' })).status === 403, 'Report update denial probe failed');
  console.log('PASS restricted service: workspace read, admin denial, report update denial');
}
async function webReady(ctx) {
  const base = `http://127.0.0.1:${ctx.meta.webPort}`;
  for (let i = 0; i < 90; i++) {
    try {
      const page = await fetch(base + '/workspace', { signal: AbortSignal.timeout(5000) });
      const session = await fetch(base + '/api/v1/auth/session', { signal: AbortSignal.timeout(5000) });
      const data = session.status === 200 ? await session.json() : null;
      const privateList = await fetch(base + '/api/v1/workspaces', { signal: AbortSignal.timeout(5000) });
      if (page.status === 200 && data?.user === null && Array.isArray(data.workspaces) && data.workspaces.length === 0 && privateList.status === 401) {
        console.log('PASS web: workspace entry 200, anonymous session empty, private workspace list 401'); return;
      }
    } catch { /* wait for process */ }
    await sleep(2000);
  }
  throw new Error('Web functional readiness failed (workspace page / anonymous session)');
}
async function build(ctx) {
  // Managed machines can have a read-only ~/.docker; preserve its registry
  // authentication and put only buildx's writable local state in this instance.
  ctx.env.BUILDX_CONFIG = join(ctx.dir, 'buildx');
  await mkdir(ctx.env.BUILDX_CONFIG, { recursive: true, mode: 0o700 });
  await safeDir(ctx.env.BUILDX_CONFIG);
  const args = ['build', '--network=host', '--build-arg', 'HTTP_PROXY', '--build-arg', 'HTTPS_PROXY', '--build-arg', 'NO_PROXY', '--build-arg', `APP_COMMIT=${ctx.env.APP_COMMIT}`];
  // Same supported workaround documented in workspace-v1.md: BuildKit can
  // lack the host's proxy DNS mapping even while normal containers resolve it.
  const proxyHosts = new Set([ctx.env.HTTP_PROXY, ctx.env.HTTPS_PROXY].filter(Boolean).map((url) => new URL(url).hostname));
  for (const host of proxyHosts) if (!isIP(host)) args.push('--add-host', `${host}:${(await lookup(host, { family: 4 })).address}`);
  if (ctx.env.CODEX_PROXY_CERT) args.push('--secret', `id=proxy_ca,src=${ctx.env.CODEX_PROXY_CERT}`);
  args.push('-f', 'web/Dockerfile', '-t', ctx.env.PRIVATE_WEB_IMAGE, '.');
  await docker(ctx, args, 'web-build');
}
export async function main(args = process.argv.slice(2)) {
  const [action, name, web, backend] = args;
  assert(['init', 'check', 'install', 'restart', 'status'].includes(action) && args.length <= (action === 'init' ? 4 : 2),
    'Usage: node tools/private-install.mjs init NAME [WEB_PORT BACKEND_PORT] | check/install/restart/status NAME');
  assert(process.versions.node.split('.')[0] === '22', 'Use Node 22 (tested with 22.14.0)');
  if (action === 'init') return createInstance(name, Number(web || 23101), Number(backend || 23100));
  const ctx = await load(name);
  // One writer per instance; never break a stale lock automatically.
  const lock = join(ctx.dir, '.installer.lock');
  const handle = await open(lock, 'wx', 0o600);
  try {
    await ownership(ctx);
    const release = JSON.parse(await readFile(join(root, 'release-manifest.json'), 'utf8'));
    assert(/^[a-f0-9]{40}$/.test(release.source_commit), 'Invalid candidate source identity');
    ctx.env.APP_COMMIT = release.source_commit;
    await compose(ctx, ['config', '--quiet'], 'compose-check');
    if (action === 'check') { console.log('PASS isolated configuration and ownership; no service changes'); return; }
    if (action === 'status') { console.log(await compose(ctx, ['ps'])); return; }
    if (action === 'restart') {
      assert(ctx.serviceToken, 'Install must provision the service before restart');
      await compose(ctx, ['restart', 'postgres', 'nocobase', 'web'], 'restart');
      await backendReady(ctx); await verifyService(ctx); await webReady(ctx); return;
    }
    console.log('Starting isolated backend; existing data and secrets are retained.');
    await compose(ctx, ['up', '-d', 'postgres', 'nocobase'], 'backend-up');
    await backendReady(ctx);
    await compose(ctx, ['--profile', 'setup', 'run', '--rm', '--no-deps', 'bootstrap'], 'bootstrap');
    if (!ctx.serviceToken) {
      await compose(ctx, ['--profile', 'setup', 'run', '--rm', '--no-deps', 'bootstrap', 'node', '/bootstrap/provision-workspace-service.mjs', '/private-secrets/workspace-service.env'], 'service-provision');
      ctx.serviceToken = (await load(name)).serviceToken;
    }
    await backendReady(ctx); await verifyService(ctx);
    await compose(ctx, ['--profile', 'setup', 'run', '--rm', '--no-deps', 'schema-guard'], 'schema-guard');
    await build(ctx);
    await compose(ctx, ['--profile', 'web', 'up', '-d', '--no-deps', 'web'], 'web-up');
    await webReady(ctx);
    console.log(`PASS installation ${name}; execute the documented real HTTP/browser and persistence acceptance next.`);
  } finally { await handle.close(); await unlink(lock); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((e) => {
  console.error(e.message); process.exitCode = 1;
});
