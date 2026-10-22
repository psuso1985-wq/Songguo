export const reportDetailsMigrationId = '20260908_report_details';

// Optional long-form details complement a short report summary.
// Existing reports remain nullable and are never backfilled by this migration.
export const reportDetailsField = {
  name: 'details',
  title: 'Details',
  type: 'text',
  interface: 'textarea',
  allowNull: true,
};

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + reportDetailsMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

export async function migrateReportDetails({ request, listMeta }) {
  const reports = findCollection(await listMeta(), 'project_reports');

  if (!findField(reports, reportDetailsField.name)) {
    await request('collections/project_reports/fields:create', {
      method: 'POST',
      body: reportDetailsField,
    });
  }

  const verified = findField(findCollection(await listMeta(), 'project_reports'), reportDetailsField.name);
  if (!verified) {
    throw new Error(reportDetailsMigrationId + ' did not create project_reports.details.');
  }
  if (verified.allowNull !== true) {
    throw new Error(
      reportDetailsMigrationId + ' created project_reports.details without nullability;'
      + ' every Report written before this field existed genuinely has no details and must store null.',
    );
  }
}
