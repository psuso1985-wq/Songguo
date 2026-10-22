import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./discussion-service-acl.json', import.meta.url), 'utf8'));

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const resourceName = (resource) => resource.resourceName || resource.name;
const normalizeActions = (resource) => (resource?.actions || [])
  .map((action) => ({ name: action.name, fields: [...(action.fields || [])].sort() }))
  .sort((left, right) => left.name.localeCompare(right.name));
const expectedActions = (grant) => normalizeActions({ actions: grant.actions });
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function listResources(request, roleName) {
  const result = await request(`roles/${encodeURIComponent(roleName)}/resources:list`, {
    query: { paginate: 'false', appends: 'actions' },
  });
  return result.data || [];
}

async function ensureRole(request) {
  const found = await request('roles:list', {
    query: { paginate: 'false', 'filter[title]': config.role_title },
  });
  const roles = found.data || [];
  assert(roles.length <= 1, `Multiple roles use title "${config.role_title}".`);
  if (roles.length === 1) {
    assert(roles[0].name === config.role_name,
      `Discussion role name is "${roles[0].name}", expected "${config.role_name}".`);
    return roles[0];
  }
  const created = await request('roles:create', {
    method: 'POST',
    body: {
      name: config.role_name,
      title: config.role_title,
      allowConfigure: false,
      allowNewMenu: false,
      values: {
        name: config.role_name,
        title: config.role_title,
        allowConfigure: false,
        allowNewMenu: false,
      },
    },
  });
  const role = Array.isArray(created.data) ? created.data[0] : created.data;
  assert(role?.name === config.role_name, 'NocoBase did not create the stable Discussion service role.');
  return role;
}

export async function ensureDiscussionServiceAcl({ request }) {
  const role = await ensureRole(request);
  const grantedNames = new Set(config.grants.map((grant) => grant.resource));
  const before = await listResources(request, role.name);
  const untouched = Object.fromEntries(before
    .filter((resource) => !grantedNames.has(resourceName(resource)))
    .map((resource) => [resourceName(resource), normalizeActions(resource)])
    .sort((left, right) => left[0].localeCompare(right[0])));

  for (const grant of config.grants) {
    const resources = await listResources(request, role.name);
    const existing = resources.find((resource) => resourceName(resource) === grant.resource);
    const desired = expectedActions(grant);
    if (existing) {
      const existingNames = normalizeActions(existing).map((action) => action.name);
      const desiredNames = desired.map((action) => action.name);
      assert(same(existingNames, desiredNames),
        `${grant.resource} has actions outside the versioned Discussion service boundary.`);
      if (!same(normalizeActions(existing), desired)) {
        await request(`roles/${encodeURIComponent(role.name)}/resources:update`, {
          method: 'POST', query: { filterByTk: existing.id },
          body: { name: grant.resource, usingActionsConfig: true, actions: desired },
        });
      }
    } else {
      await request(`roles/${encodeURIComponent(role.name)}/resources:create`, {
        method: 'POST',
        body: { name: grant.resource, usingActionsConfig: true, actions: desired },
      });
    }
  }

  const after = await listResources(request, role.name);
  const afterUntouched = Object.fromEntries(after
    .filter((resource) => !grantedNames.has(resourceName(resource)))
    .map((resource) => [resourceName(resource), normalizeActions(resource)])
    .sort((left, right) => left[0].localeCompare(right[0])));
  assert(same(untouched, afterUntouched), 'Unrelated permissions changed while applying Discussion ACL.');

  for (const grant of config.grants) {
    const actual = after.find((resource) => resourceName(resource) === grant.resource);
    assert(actual && same(normalizeActions(actual), expectedActions(grant)),
      `${grant.resource} does not match the versioned Discussion ACL.`);
  }

  return {
    role_key: config.role_key,
    role_name: config.role_name,
    resources: Object.fromEntries(config.grants.map((grant) => [grant.resource, expectedActions(grant)])),
  };
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
    try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }
    if (!response.ok) throw new Error(`${method} ${url.pathname} failed (${response.status}).`);
    return json;
  };
  const signedIn = await request('auth:signIn', {
    method: 'POST', body: { account: email, password },
  });
  token = signedIn.data?.token;
  if (!token) throw new Error('NocoBase sign-in did not return a token.');
  console.log(JSON.stringify({ status: 'applied', ...(await ensureDiscussionServiceAcl({ request })) }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
