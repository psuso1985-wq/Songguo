export const projectAgentApiAuditMigrationId = '20260828_project_agent_api_audit';

// When a Project appears in AIsys, the next question is who put it there. The
// Agent API answers it with three nullable columns written once at creation.
//
// They hold lookup keys, never secrets: a Credential key and a Machine key
// identify which credential and which registered machine were presented, while
// the Credential Secret, the Machine Secret, the Authorization header and the
// HMAC pepper stay out of the database entirely.
//
// Nullable is the point. Every Project that predates this migration keeps empty
// provenance and is never backfilled -- inventing a creator for a historical
// row would make the audit trail less trustworthy, not more.
export const projectCreatedViaValues = ['AGENT_API'];

export const projectAuditFields = [
  {
    name: 'created_via', title: 'Created via', type: 'string', interface: 'select', allowNull: true,
    uiSchema: {
      type: 'string', title: 'Created via', 'x-component': 'Select',
      enum: projectCreatedViaValues.map((value) => ({ label: value, value })),
    },
  },
  { name: 'created_by_credential_key', title: 'Created by credential key', type: 'string', interface: 'input', allowNull: true },
  { name: 'created_by_machine_key', title: 'Created by machine key', type: 'string', interface: 'input', allowNull: true },
];

export async function migrateProjectAgentApiAudit({ request, listMeta }) {
  const before = (await listMeta()).find((item) => item.name === 'projects');
  if (!before) throw new Error(projectAgentApiAuditMigrationId + ' requires the projects collection.');
  for (const field of projectAuditFields) {
    if (!(before.fields || []).some((existing) => existing.name === field.name)) {
      await request('collections/projects/fields:create', { method: 'POST', body: field });
    }
  }

  const after = (await listMeta()).find((item) => item.name === 'projects');
  for (const field of projectAuditFields) {
    const actual = (after?.fields || []).find((existing) => existing.name === field.name);
    if (!actual) throw new Error(projectAgentApiAuditMigrationId + ' did not provide projects.' + field.name + '.');
    if (actual.allowNull !== true) throw new Error(projectAgentApiAuditMigrationId + ' requires projects.' + field.name + ' to stay nullable.');
  }

  // The vocabulary is reconciled on every run, the same way the Project category
  // is, so a column added before a value existed still offers it afterwards.
  const createdVia = (after?.fields || []).find((existing) => existing.name === 'created_via');
  const options = (createdVia?.uiSchema?.enum || []).map((option) => option.value);
  for (const value of options) {
    if (!projectCreatedViaValues.includes(value)) {
      throw new Error(projectAgentApiAuditMigrationId + ' found unversioned projects.created_via value ' + value + '.');
    }
  }
  if (projectCreatedViaValues.some((value) => !options.includes(value))) {
    await request('collections/projects/fields:update', {
      method: 'POST',
      query: { filterByTk: 'created_via' },
      body: { name: 'created_via', uiSchema: { ...(createdVia?.uiSchema || {}), enum: projectCreatedViaValues.map((value) => ({ label: value, value })) } },
    });
  }
}
