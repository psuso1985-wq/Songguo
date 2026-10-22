import { readFile } from 'node:fs/promises';

const config = JSON.parse(await readFile(new URL('./machine-credential-service-acl.json', import.meta.url), 'utf8'));

export async function ensureMachineCredentialServiceAcl({ request }) {
  const existing = await request('roles:list', { query: { paginate: 'false', 'filter[title]': config.role_title } });
  let role = (existing.data || [])[0];
  if (!role) {
    const created = await request('roles:create', {
      method: 'POST',
      body: { name: config.role_name, title: config.role_title, allowConfigure: false, allowNewMenu: false,
        values: { name: config.role_name, title: config.role_title, allowConfigure: false, allowNewMenu: false } },
    });
    role = Array.isArray(created.data) ? created.data[0] : created.data;
  }
  if (!role || role.name !== config.role_name) throw new Error('Machine credential service role could not be created with its stable name.');

  const resources = await request('roles/' + encodeURIComponent(role.name) + '/resources:list', { query: { paginate: 'false', appends: 'actions' } });
  const existingByName = new Map((resources.data || []).map((resource) => [resource.resourceName || resource.name, resource]));
  for (const grant of config.grants) {
    const found = existingByName.get(grant.resource);
    const body = { name: grant.resource, usingActionsConfig: true, actions: grant.actions };
    if (found) await request('roles/' + encodeURIComponent(role.name) + '/resources:update', { method: 'POST', query: { filterByTk: found.id }, body });
    else await request('roles/' + encodeURIComponent(role.name) + '/resources:create', { method: 'POST', body });
  }
  return { role_name: role.name, resources: config.grants.map((grant) => grant.resource) };
}