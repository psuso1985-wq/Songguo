// Server-only bridge. Visitors authenticate as ordinary NocoBase users; the
// public API authorizes workspace membership before using this restricted role.
export const workspaceRole = 'songguo-workspace-service';
export const workspaceMutable = ['workspaces', 'workspace_members', 'workspace_invitations', 'agents', 'projects', 'project_members', 'project_user_members', 'work_tasks', 'agent_credentials'];
export const workspaceAppendOnly = ['project_resources', 'project_reports', 'workspace_events'];
export const workspaceResources = [...workspaceMutable, ...workspaceAppendOnly, 'attachments'];

// These collections were introduced by Workspace V1 and have no legacy member
// grants to preserve. Existing Phase 1 collections and attachments deliberately
// stay out of this list: their native member ACL belongs to the pre-existing app.
export const memberRestrictedResources = ['workspaces', 'workspace_members', 'workspace_invitations', 'project_user_members', 'project_resources', 'workspace_events'];

const cloneActions = (actions = []) => actions.map((action) => ({
  name: action.name,
  ...(Array.isArray(action.fields) ? { fields: [...action.fields] } : {}),
  ...(action.scope !== undefined ? { scope: structuredClone(action.scope) } : {}),
}));
const resourceBody = (resource) => ({
  name: resource.name,
  usingActionsConfig: Boolean(resource.usingActionsConfig),
  actions: cloneActions(resource.actions),
});
const roleFields = ['name', 'title', 'description', 'strategy', 'default', 'hidden', 'allowConfigure', 'allowNewMenu', 'snippets'];
const roleBody = (role, includeName = true) => Object.fromEntries(roleFields
  .filter((field) => (includeName || field !== 'name') && role?.[field] !== undefined)
  .map((field) => [field, structuredClone(role[field])]));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
};
const normalizeResource = (resource) => ({
  name: resource.name,
  usingActionsConfig: Boolean(resource.usingActionsConfig),
  actions: cloneActions(resource.actions).map((action) => ({
    ...action,
    ...(action.fields ? { fields: [...action.fields].sort() } : {}),
    ...(action.scope !== undefined ? { scope: canonical(action.scope) } : {}),
  })).sort((left, right) => left.name.localeCompare(right.name)),
});
export const normalizeWorkspaceServiceAclSnapshot = (snapshot) => ({
  basic: canonical(snapshot.basic),
  role: snapshot.role ? canonical({ ...roleBody(snapshot.role), snippets: [...(snapshot.role.snippets || [])].sort() }) : null,
  serviceResources: (snapshot.serviceResources || []).map(normalizeResource).sort((left, right) => left.name.localeCompare(right.name)),
  memberResources: (snapshot.memberResources || []).map(normalizeResource).sort((left, right) => left.name.localeCompare(right.name)),
});
export function workspaceServiceAclSnapshotsEqual(left, right) {
  return JSON.stringify(normalizeWorkspaceServiceAclSnapshot(left)) === JSON.stringify(normalizeWorkspaceServiceAclSnapshot(right));
}
async function resources(request, role) {
  return (await request(`roles/${role}/resources:list`, { query: { paginate: 'false', appends: 'actions' } })).data || [];
}

// Provisioning captures this before changing signup/ACL state. It contains
// configuration only (never passwords, tokens or environment values).
export async function snapshotWorkspaceServiceAcl({ request }) {
  const basic = (await request('authenticators:list', { query: { paginate: 'false', 'filter[name]': 'basic' } })).data?.[0];
  if (!basic) throw new Error('Workspace V1 requires the existing basic authenticator');
  const role = ((await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data || [])[0] || null;
  return {
    basic: { id: basic.id, enabled: basic.enabled, options: structuredClone(basic.options || {}) },
    role: role ? roleBody(role) : null,
    serviceResources: role ? (await resources(request, workspaceRole)).filter((row) => workspaceResources.includes(row.name)).map((row) => ({ id: row.id, ...resourceBody(row) })) : [],
    memberResources: (await resources(request, 'member')).filter((row) => memberRestrictedResources.includes(row.name)).map((row) => ({ id: row.id, ...resourceBody(row) })),
  };
}

const errorText = (error) => String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, ' ').slice(0, 240);
async function restoreResources(request, role, names, saved, failures) {
  let current;
  try {
    current = await resources(request, role);
  } catch (error) {
    failures.push(`${role} resources list: ${errorText(error)}`);
    return;
  }
  for (const name of names) {
    const now = current.find((row) => row.name === name);
    const before = saved.find((row) => row.name === name);
    try {
      if (before) {
        await request(`roles/${role}/resources:${now ? 'update' : 'create'}`, {
          method: 'POST',
          ...(now ? { query: { filterByTk: now.id } } : {}),
          body: resourceBody(before),
        });
      } else if (now) {
        await request(`roles/${role}/resources:destroy`, { method: 'POST', query: { filterByTk: now.id } });
      }
    } catch (error) {
      failures.push(`${role}.${name}: ${errorText(error)}`);
    }
  }
}

export async function restoreWorkspaceServiceAcl({ request, snapshot }) {
  const failures = [];
  try {
    await request('authenticators:update', {
      method: 'POST',
      query: { filterByTk: snapshot.basic.id },
      body: { enabled: snapshot.basic.enabled, options: snapshot.basic.options },
    });
  } catch (error) {
    failures.push(`basic authenticator: ${errorText(error)}`);
  }
  let currentRole = null;
  try {
    currentRole = ((await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data || [])[0] || null;
  } catch (error) {
    failures.push(`workspace role list: ${errorText(error)}`);
  }
  if (snapshot.role) {
    try {
      if (!currentRole) {
        await request('roles:create', { method: 'POST', body: roleBody(snapshot.role) });
      } else {
        await request('roles:update', { method: 'POST', query: { filterByTk: currentRole.name }, body: roleBody(snapshot.role, false) });
      }
    } catch (error) {
      failures.push(`workspace role metadata: ${errorText(error)}`);
    }
    await restoreResources(request, workspaceRole, workspaceResources, snapshot.serviceResources, failures);
  } else if (currentRole) {
    try {
      await request('roles:destroy', { method: 'POST', query: { filterByTk: currentRole.name } });
    } catch (error) {
      failures.push(`workspace role removal: ${errorText(error)}`);
    }
  }
  await restoreResources(request, 'member', memberRestrictedResources, snapshot.memberResources, failures);
  let restored;
  try {
    restored = await snapshotWorkspaceServiceAcl({ request });
    if (!workspaceServiceAclSnapshotsEqual(restored, snapshot)) failures.push('readback did not match the captured snapshot');
  } catch (error) {
    failures.push(`readback: ${errorText(error)}`);
  }
  if (failures.length) throw new Error(`Workspace ACL restore failed: ${failures.join('; ')}`);
  return restored;
}

export async function ensureWorkspaceServiceAcl({ request, listMeta }) {
  const basic = (await request('authenticators:list', { query: { paginate: 'false', 'filter[name]': 'basic' } })).data?.[0];
  if (!basic) throw new Error('Workspace V1 requires the existing basic authenticator');
  // Native signup saves only fields declared in its signup form. A 200 with
  // username-only defaults silently discards email and prevents email login.
  await request('authenticators:update', { method: 'POST', query: { filterByTk: basic.id }, body: { enabled: true, options: { ...basic.options, public: { ...basic.options?.public, allowSignUp: true, signupForm: [{ field: 'username', show: true, required: true }, { field: 'email', show: true, required: true }, { field: 'nickname', show: true, required: true }] } } } });
  const roles = (await request('roles:list', { query: { paginate: 'false', 'filter[name]': workspaceRole } })).data || [];
  if (!roles.length) await request('roles:create', { method: 'POST', body: { name: workspaceRole, title: 'Songguo Workspace Service', allowConfigure: false, allowNewMenu: false } });
  const meta = await listMeta();
  const serviceResources = await resources(request, workspaceRole);
  for (const name of workspaceResources) {
    const fields = name === 'attachments' ? ['id', 'title', 'filename', 'extname', 'path', 'url', 'size', 'mimetype', 'meta', 'storageId', 'createdAt'] : [...new Set((meta.find((c) => c.name === name)?.fields || []).flatMap((f) => f.type === 'belongsTo' ? [f.foreignKey] : ['hasMany', 'belongsToMany'].includes(f.type) ? [] : [f.name]).filter(Boolean))];
    if (!fields.length) throw new Error('Workspace ACL requires ' + name);
    const actions = ['view', 'create', ...(workspaceMutable.includes(name) ? ['update'] : [])].map((action) => ({ name: action, fields }));
    const current = serviceResources.find((row) => row.name === name);
    await request(`roles/${workspaceRole}/resources:${current ? 'update' : 'create'}`, { method: 'POST', ...(current ? { query: { filterByTk: current.id } } : {}), body: { name, usingActionsConfig: true, actions } });
  }
  const memberResources = await resources(request, 'member');
  for (const name of memberRestrictedResources) {
    const member = memberResources.find((row) => row.name === name);
    await request(`roles/member/resources:${member ? 'update' : 'create'}`, { method: 'POST', ...(member ? { query: { filterByTk: member.id } } : {}), body: { name, usingActionsConfig: true, actions: [] } });
  }
  return { role: workspaceRole, resources: workspaceResources, memberRestrictedResources };
}
