export const phase2ProjectFactsMigrationId = '20260821_phase_2_project_facts';

export const projectReportTypeValues = [
  'PROGRESS',
  'COMPLETION',
  'CORRECTION',
  'DECISION',
];

export const nextCheckAtField = {
  name: 'next_check_at',
  title: 'Next check at',
  type: 'date',
  interface: 'datetime',
  allowNull: true,
  timezone: true,
};

function findCollection(metadata, name) {
  const collection = metadata.find((item) => item.name === name);
  if (!collection) throw new Error('Cannot apply ' + phase2ProjectFactsMigrationId + ': ' + name + ' collection metadata is missing.');
  return collection;
}

function findField(collection, name) {
  return (collection.fields || []).find((field) => field.name === name);
}

function enumValues(field) {
  return (field?.uiSchema?.enum || []).map((item) => item.value);
}

export async function migratePhase2ProjectFacts({ request, listMeta }) {
  let metadata = await listMeta();
  let projects = findCollection(metadata, 'projects');
  if (!findField(projects, nextCheckAtField.name)) {
    await request('collections/projects/fields:create', {
      method: 'POST',
      body: nextCheckAtField,
    });
    metadata = await listMeta();
    projects = findCollection(metadata, 'projects');
  }

  const reports = findCollection(metadata, 'project_reports');
  const reportType = findField(reports, 'report_type');
  if (!reportType) {
    throw new Error('Cannot apply ' + phase2ProjectFactsMigrationId + ': project_reports.report_type metadata is missing.');
  }
  if (JSON.stringify(enumValues(reportType)) !== JSON.stringify(projectReportTypeValues)) {
    await request('collections/project_reports/fields:update', {
      method: 'POST',
      query: { filterByTk: 'report_type' },
      body: {
        uiSchema: {
          ...(reportType.uiSchema || {}),
          enum: projectReportTypeValues.map((value) => ({ label: value, value })),
        },
      },
    });
  }

  metadata = await listMeta();
  const verifiedNextCheckAt = findField(findCollection(metadata, 'projects'), nextCheckAtField.name);
  const verifiedReportType = findField(findCollection(metadata, 'project_reports'), 'report_type');
  if (
    verifiedNextCheckAt?.type !== 'date'
    || verifiedNextCheckAt?.interface !== 'datetime'
    || verifiedNextCheckAt?.allowNull !== true
    || verifiedNextCheckAt?.timezone !== true
  ) {
    throw new Error(phase2ProjectFactsMigrationId + ' did not create nullable projects.next_check_at.');
  }
  if (JSON.stringify(enumValues(verifiedReportType)) !== JSON.stringify(projectReportTypeValues)) {
    throw new Error(phase2ProjectFactsMigrationId + ' did not add DECISION to project_reports.report_type.');
  }
}
