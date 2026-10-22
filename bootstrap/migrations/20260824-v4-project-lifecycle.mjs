export const v4ProjectLifecycleMigrationId = '20260824_v4_project_lifecycle';

export const lifecycleValues = ['ACTIVE', 'CLOSING', 'COMPLETED', 'CANCELLED', 'ARCHIVED'];

export const lifecycleStatusField = {
  name: 'lifecycle_status',
  title: 'V4 lifecycle status',
  type: 'string',
  interface: 'select',
  allowNull: true,
  uiSchema: {
    type: 'string',
    title: 'V4 lifecycle status',
    'x-component': 'Select',
    enum: lifecycleValues.map((value) => ({ label: value, value })),
  },
};

const fail = (message) => { throw new Error(message); };
const collection = (metadata, name) => metadata.find((item) => item.name === name)
  || fail('Cannot apply ' + v4ProjectLifecycleMigrationId + ': ' + name + ' metadata is missing.');
const field = (entry, name) => (entry.fields || []).find((item) => item.name === name);

export async function migrateV4ProjectLifecycle({ request, listMeta }) {
  let projects = collection(await listMeta(), 'projects');
  let lifecycle = field(projects, lifecycleStatusField.name);
  if (!lifecycle) {
    await request('collections/projects/fields:create', { method: 'POST', body: lifecycleStatusField });
    projects = collection(await listMeta(), 'projects');
    lifecycle = field(projects, lifecycleStatusField.name);
  }

  const values = (lifecycle?.uiSchema?.enum || []).map((item) => item.value);
  if (
    lifecycle?.type !== 'string'
    || lifecycle?.interface !== 'select'
    || lifecycle?.allowNull !== true
    || JSON.stringify(values) !== JSON.stringify(lifecycleValues)
  ) {
    fail(v4ProjectLifecycleMigrationId + ' requires nullable projects.lifecycle_status with the frozen V4 enum.');
  }

  // Intentionally no data backfill: missing is a truthful state for legacy
  // projects, and PLANNED/BLOCKED/WAITING_OWNER cannot safely infer V4 facts.
}
