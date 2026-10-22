export const periodicReportKindMigrationId = '20260908_periodic_report_kind';

// Optional reporting-period metadata, set explicitly by the project owner.
// Existing projects remain nullable; this migration does not infer or backfill it.
export const periodicReportKindField = {
  name: 'periodic_report_kind',
  title: 'Periodic report kind',
  type: 'string',
  interface: 'select',
  allowNull: true,
  uiSchema: {
    type: 'string', title: 'Periodic report kind', 'x-component': 'Select',
    enum: ['WEEKLY', 'MONTHLY'].map((value) => ({ label: value, value })),
  },
};

function findCollection(metadata, name) {
  return metadata.find((item) => item.name === name);
}
function findField(collection, name) {
  return (collection?.fields || []).find((field) => field.name === name);
}

export async function migratePeriodicReportKind({ request, listMeta }) {
  let metadata = await listMeta();
  const projects = findCollection(metadata, 'projects');
  if (!projects) throw new Error('Cannot apply ' + periodicReportKindMigrationId + ': projects collection metadata is missing.');

  if (!findField(projects, periodicReportKindField.name)) {
    await request('collections/projects/fields:create', { method: 'POST', body: periodicReportKindField });
    metadata = await listMeta();
  }

  const verified = findField(findCollection(metadata, 'projects'), periodicReportKindField.name);
  if (!verified) throw new Error(periodicReportKindMigrationId + ' did not create projects.periodic_report_kind.');
  if (verified.allowNull !== true) {
    throw new Error(periodicReportKindMigrationId + ' created projects.periodic_report_kind without nullability; every existing Project requires null.');
  }
}
