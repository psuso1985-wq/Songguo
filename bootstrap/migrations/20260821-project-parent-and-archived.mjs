export const projectParentAndArchivedMigrationId = '20260821_project_parent_and_archived';

export const projectStatusValues = [
  'PLANNED',
  'ACTIVE',
  'BLOCKED',
  'WAITING_OWNER',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
];

export const parentProjectField = {
  name: 'parent_project',
  title: 'Parent project',
  type: 'belongsTo',
  interface: 'm2o',
  target: 'projects',
  foreignKey: 'parent_project_id',
  targetKey: 'id',
  allowNull: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
  constraints: true,
};

function getProjects(metadata) {
  const projects = metadata.find((collection) => collection.name === 'projects');
  if (!projects) {
    throw new Error('Cannot apply ' + projectParentAndArchivedMigrationId + ': projects collection metadata is missing.');
  }
  return projects;
}

function getField(projects, name) {
  return (projects.fields || []).find((field) => field.name === name);
}

function enumValues(field) {
  return (field?.uiSchema?.enum || []).map((item) => item.value);
}

export async function migrateProjectsParentAndArchived({ request, listMeta }) {
  let metadata = await listMeta();
  let projects = getProjects(metadata);

  if (!getField(projects, parentProjectField.name)) {
    await request('collections/projects/fields:create', {
      method: 'POST',
      body: parentProjectField,
    });
    metadata = await listMeta();
    projects = getProjects(metadata);
  }

  const status = getField(projects, 'status');
  if (!status) {
    throw new Error('Cannot apply ' + projectParentAndArchivedMigrationId + ': projects.status metadata is missing.');
  }
  if (JSON.stringify(enumValues(status)) !== JSON.stringify(projectStatusValues)) {
    await request('collections/projects/fields:update', {
      method: 'POST',
      query: { filterByTk: 'status' },
      body: {
        uiSchema: {
          ...(status.uiSchema || {}),
          enum: projectStatusValues.map((value) => ({ label: value, value })),
        },
      },
    });
  }

  metadata = await listMeta();
  projects = getProjects(metadata);
  const parent = getField(projects, parentProjectField.name);
  if (
    parent?.foreignKey !== parentProjectField.foreignKey
    || parent?.allowNull !== true
    || parent?.target !== 'projects'
    || parent?.onDelete !== 'SET NULL'
  ) {
    throw new Error(projectParentAndArchivedMigrationId + ' did not create the safe projects.parent_project relation.');
  }
  if (JSON.stringify(enumValues(getField(projects, 'status'))) !== JSON.stringify(projectStatusValues)) {
    throw new Error(projectParentAndArchivedMigrationId + ' did not add ARCHIVED to projects.status.');
  }
}
