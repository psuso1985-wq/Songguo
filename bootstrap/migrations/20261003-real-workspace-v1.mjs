// Additive product migration. PostgreSQL/NocoBase remains the sole fact store.
export const realWorkspaceMigrationId = '20261003_real_workspace_v1';
const string = (name, required = false) => ({ name, type: 'string', interface: 'input', allowNull: !required });
const text = (name) => ({ name, type: 'text', interface: 'textarea', allowNull: true });
const date = (name) => ({ name, type: 'date', interface: 'datetime', allowNull: true });
const json = (name) => ({ name, type: 'json', interface: 'json', allowNull: true });
const relation = (name, target, required = false) => ({ name, type: 'belongsTo', interface: 'm2o', target, foreignKey: name + '_id', allowNull: !required });
const presets = () => [
  { name: 'id', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', type: 'date', interface: 'createdAt' },
  { name: 'updatedAt', type: 'date', interface: 'updatedAt' },
];
const index = (name, fields, unique = false) => ({ name, fields, unique });
export const workspaceCollections = [
  { name: 'workspaces', fields: [string('workspace_key', true), string('name', true), relation('owner_user', 'users', true), text('description'), string('team_type'), string('setup_step'), date('setup_completed_at')], indexes: [index('workspace_key_uk', ['workspace_key'], true)] },
  { name: 'workspace_members', fields: [relation('workspace', 'workspaces', true), relation('user', 'users', true), string('role', true), string('display_name'), string('email'), string('status', true)], indexes: [index('workspace_member_uk', ['workspace_id', 'user_id'], true)] },
  { name: 'workspace_invitations', fields: [relation('workspace', 'workspaces', true), string('token_hash', true), string('email', true), relation('invited_by_user', 'users', true), relation('accepted_by_user', 'users'), string('status', true), date('expires_at'), date('accepted_at')], indexes: [index('workspace_invitation_token_uk', ['token_hash'], true)] },
  { name: 'project_user_members', fields: [relation('workspace', 'workspaces', true), relation('project', 'projects', true), relation('user', 'users', true)], indexes: [index('project_user_member_uk', ['project_id', 'user_id'], true)] },
  { name: 'project_resources', fields: [relation('workspace', 'workspaces', true), relation('project', 'projects', true), relation('added_by_user', 'users'), relation('added_by_agent', 'agents'), string('name', true), string('kind', true), text('source'), text('purpose'), relation('attachment', 'attachments'), string('sha256'), string('filename'), { name: 'size', type: 'bigInt', interface: 'integer' }, string('mimetype')], indexes: [index('project_resources_scope_idx', ['workspace_id', 'project_id'])] },
  { name: 'workspace_events', fields: [relation('workspace', 'workspaces', true), relation('project', 'projects'), relation('task', 'work_tasks'), relation('agent', 'agents'), relation('invitation', 'workspace_invitations'), relation('actor_user', 'users'), relation('actor_agent', 'agents'), string('event_key', true), string('event_type', true), text('summary'), date('occurred_at'), json('structured')], indexes: [index('workspace_event_key_uk', ['workspace_id', 'event_key'], true), index('workspace_events_project_idx', ['workspace_id', 'project_id'])] },
];
export const workspaceAdditionalFields = {
  agents: [relation('workspace', 'workspaces'), relation('responsible_user', 'users'), string('connection_status'), date('last_connected_at'), text('connection_error')],
  projects: [relation('workspace', 'workspaces'), relation('owner_user', 'users'), text('acceptance_criteria'), string('phase_status')],
  project_members: [relation('workspace', 'workspaces')],
  work_tasks: [relation('workspace', 'workspaces'), relation('executor_user', 'users'), relation('responsible_user', 'users'), relation('reviewer_user', 'users'), json('input_resource_ids')],
  project_reports: [relation('workspace', 'workspaces'), relation('submitted_by_user', 'users'), relation('task', 'work_tasks'), relation('supplements_report', 'project_reports'), relation('reviewed_report', 'project_reports'), string('decision_outcome'), json('input_resource_ids'), json('evidence_resource_ids'), string('operation_key'), string('operation_fingerprint')],
  agent_credentials: [relation('workspace', 'workspaces'), relation('issued_by_user', 'users'), date('last_used_at')],
};
export async function migrateRealWorkspaceV1({ request, listMeta }) {
  let meta = await listMeta();
  for (const collection of workspaceCollections) {
    if (!meta.some((row) => row.name === collection.name)) {
      await request('collections:create', { method: 'POST', body: { ...collection, title: collection.name, autoGenId: false, fields: [...presets(), ...collection.fields] } });
      meta = await listMeta();
    }
  }
  for (const [collection, fields] of Object.entries(workspaceAdditionalFields)) {
    const current = meta.find((row) => row.name === collection);
    if (!current) throw new Error('Workspace migration requires existing collection ' + collection);
    for (const field of fields) {
      if (!(current.fields || []).some((row) => row.name === field.name)) {
        await request('collections/' + collection + '/fields:create', { method: 'POST', body: field });
      }
    }
  }
  // A human Owner/submitter has a users identity. Do not manufacture an Agent
  // to satisfy the older single-tenant model's required Agent relation.
  for (const [collection, field] of [['projects', 'owner'], ['project_reports', 'submitted_by']]) {
    if (meta.find((row) => row.name === collection)?.fields?.find((row) => row.name === field)?.allowNull !== true) {
      await request('collections/' + collection + '/fields:update', { method: 'POST', query: { filterByTk: field }, body: { allowNull: true } });
    }
  }
  const reportType = meta.find((row) => row.name === 'project_reports')?.fields?.find((row) => row.name === 'report_type');
  if (!(reportType?.uiSchema?.enum || []).some((row) => row.value === 'PROJECT_EVENT')) {
    await request('collections/project_reports/fields:update', { method: 'POST', query: { filterByTk: 'report_type' }, body: { uiSchema: { ...reportType.uiSchema, enum: [...reportType.uiSchema.enum, { label: 'PROJECT_EVENT', value: 'PROJECT_EVENT' }] } } });
  }
  // Cross-record concurrency constraints are in the paired PostgreSQL migration,
  // applied by the existing schema-guard service after NocoBase adds the fields.
}
