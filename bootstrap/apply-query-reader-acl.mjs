#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./query-reader-acl.json', import.meta.url), 'utf8'));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function actionNames(resource) {
  return [...new Set((resource?.actions || []).map((action) => action.name).filter(Boolean))].sort();
}

function actionConfig(resource) {
  return (resource?.actions || [])
    .map((action) => ({ name: action.name, fields: [...(action.fields || [])].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function snapshot(resources, names) {
  return Object.fromEntries(names.map((name) => {
    const resource = resources.find((candidate) => (candidate.resourceName || candidate.name) === name);
    assert(resource, `Missing existing query-reader permission for ${name}; no ACL change was made.`);
    return [name, actionNames(resource)];
  }));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function listResources(request, roleKey) {
  const result = await request(`roles/${encodeURIComponent(roleKey)}/resources:list`, {
    query: { paginate: 'false', appends: 'actions' },
  });
  return result.data || [];
}

async function findRole(request, roleKey, roleTitle) {
  const result = await request('roles:list', {
    query: { paginate: 'false', 'filter[title]': roleTitle },
  });
  const roles = result.data || [];
  assert(
    roles.length === 1,
    `Expected exactly one Query Reader role for stable key ${roleKey}; no ACL change was made.`,
  );
  return roles[0];
}

export async function ensureQueryReaderAcl({ request }) {
  const roleKey = config.role_key;
  const readResources = config.existing_read_resources;
  // Each grant is versioned in query-reader-acl.json and applied on every
  // bootstrap. Anything already present must match the file exactly, so a
  // permission widened by hand in NocoBase fails the run instead of surviving.
  const grants = config.grants.map((grant) => ({
    resource: grant.resource,
    actions: grant.actions.map((action) => ({ ...action, fields: [...action.fields].sort() })),
  }));

  const role = await findRole(request, roleKey, config.role_title);
  const roleName = role.name;
  const before = await listResources(request, roleName);
  const preserved = snapshot(before, readResources);
  const applied = {};

  for (const grant of grants) {
    const existing = before.find((resource) => (resource.resourceName || resource.name) === grant.resource);
    applied[grant.resource] = existing ? 'already-applied' : 'applied';
    if (existing) {
      assert(
        same(actionNames(existing), ['view']),
        `Existing ${grant.resource} permission for ${roleKey} is not read-only; no ACL change was made.`,
      );
      if (same(actionConfig(existing), grant.actions)) continue;
      applied[grant.resource] = 'updated';
      await request(`roles/${encodeURIComponent(roleName)}/resources:update`, {
        method: 'POST',
        query: { filterByTk: existing.id },
        body: { name: grant.resource, usingActionsConfig: true, actions: grant.actions },
      });
      continue;
    }
    await request(`roles/${encodeURIComponent(roleName)}/resources:create`, {
      method: 'POST',
      body: { name: grant.resource, usingActionsConfig: true, actions: grant.actions },
    });
  }

  const after = await listResources(request, roleName);
  assert(
    same(preserved, snapshot(after, readResources)),
    'Existing Query Reader permissions changed while applying read access.',
  );
  const granted = {};
  for (const grant of grants) {
    const resource = after.find((candidate) => (candidate.resourceName || candidate.name) === grant.resource);
    assert(resource, `${grant.resource} permission was not created.`);
    assert(
      same(actionConfig(resource), grant.actions),
      `${grant.resource} permission is not exactly the versioned read-only action set.`,
    );
    granted[grant.resource] = actionConfig(resource);
  }
  console.log(JSON.stringify({
    status: Object.values(applied).every((value) => value === 'already-applied') ? 'already-applied' : 'applied',
    role_key: roleKey,
    role_title: config.role_title,
    grants: applied,
    granted_actions: granted,
    preserved_resources: readResources,
  }));
}

async function main() {
  const baseUrl = (process.env.NOCOBASE_URL || 'http://nocobase:80').replace(/\/$/, '');
  const email = process.env.INIT_ROOT_EMAIL;
  const password = process.env.INIT_ROOT_PASSWORD;
  if (!email || !password) throw new Error('INIT_ROOT_EMAIL and INIT_ROOT_PASSWORD are required.');

  let token;
  const request = async (path, { method = 'GET', body, query } = {}) => {
    const url = new URL(baseUrl + '/api/' + path.replace(/^\//, ''));
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token, 'X-Role': 'root', 'X-Authenticator': 'basic' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let json;
    try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!response.ok) throw new Error(`${method} ${url.pathname} failed (${response.status}).`);
    return json;
  };

  const signedIn = await request('auth:signIn', { method: 'POST', body: { account: email, password } });
  token = signedIn.data?.token;
  if (!token) throw new Error('Root sign-in did not return a token.');
  await ensureQueryReaderAcl({ request });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
