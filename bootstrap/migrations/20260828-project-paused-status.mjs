export const projectPausedStatusMigrationId = '20260828_project_paused_status';

// A Project can be deliberately stopped without anything blocking it: the Owner
// decides to put it down for now. That is not BLOCKED (something is in the
// way), not WAITING_OWNER (a decision is pending), and not ARCHIVED (retired
// from active work). `agents.status` has carried PAUSED since Phase 1; this
// gives Projects the same word for the same thing.
export const projectStatuses = [
  'PLANNED', 'ACTIVE', 'PAUSED', 'BLOCKED', 'WAITING_OWNER', 'COMPLETED', 'CANCELLED', 'ARCHIVED',
];

export async function migrateProjectPausedStatus({ request, listMeta }) {
  const projects = (await listMeta()).find((item) => item.name === 'projects');
  const status = (projects?.fields || []).find((field) => field.name === 'status');
  if (!status) throw new Error(projectPausedStatusMigrationId + ' requires projects.status.');

  const current = (status.uiSchema?.enum || []).map((option) => option.value);
  if (current.includes('PAUSED')) return;

  // Every existing value is preserved and the order is versioned here, so a
  // rerun cannot quietly drop a status that live records already use.
  for (const value of current) {
    if (!projectStatuses.includes(value)) {
      throw new Error(projectPausedStatusMigrationId + ' found unversioned projects.status value ' + value + '.');
    }
  }

  await request('collections/projects/fields:update', {
    method: 'POST',
    query: { filterByTk: 'status' },
    body: {
      name: 'status',
      uiSchema: {
        ...(status.uiSchema || {}),
        enum: projectStatuses.map((value) => ({ label: value, value })),
      },
    },
  });

  const after = (await listMeta()).find((item) => item.name === 'projects');
  const values = ((after?.fields || []).find((field) => field.name === 'status')?.uiSchema?.enum || []).map((option) => option.value);
  if (!values.includes('PAUSED')) throw new Error(projectPausedStatusMigrationId + ' did not add PAUSED.');
}
