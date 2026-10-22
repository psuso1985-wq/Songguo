export const projectStageModelMigrationId = '20260902_project_stage_model';

// Optional project stage models and structured report observations.
// Reported stages do not create formal work items or change project authority.
export const stageModelFields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'model_key', title: 'Model key', type: 'string', interface: 'input', allowNull: false },
  { name: 'name', title: 'Name', type: 'string', interface: 'input', allowNull: false },
  { name: 'description', title: 'Description', type: 'text', interface: 'textarea', allowNull: true },
  // One JSON array: [{ code, name, order, stations: [{ code, name, order }] }].
  // `stations` may be an empty array -- a large station is allowed to have no
  // defined sub-stations yet, and a Report against it stays honest about that
  // (see structured-report.ts: station_unverified).
  { name: 'stages', title: 'Stages', type: 'json', interface: 'json', allowNull: false, defaultValue: [] },
  { name: 'version', title: 'Version', type: 'integer', interface: 'integer', allowNull: false, defaultValue: 1 },
  { name: 'status', title: 'Status', type: 'string', interface: 'select', allowNull: false, defaultValue: 'ACTIVE',
    uiSchema: { type: 'string', title: 'Status', 'x-component': 'Select', enum: ['ACTIVE', 'RETIRED'].map((value) => ({ label: value, value })) } },
];

export const projectStageModelField = {
  name: 'stage_model',
  title: 'Stage model',
  type: 'belongsTo',
  interface: 'm2o',
  target: 'project_stage_models',
  foreignKey: 'stage_model_id',
  targetKey: 'id',
  allowNull: true,
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE',
  constraints: true,
};

export const reportStructuredFields = [
  // JSON, nullable: every Report that predates this migration simply has no
  // structured block, which is accurate -- it was written before one could
  // exist. Never backfilled.
  { name: 'structured', title: 'Structured', type: 'json', interface: 'json', allowNull: true },
  { name: 'structured_schema_version', title: 'Structured schema version', type: 'integer', interface: 'integer', allowNull: true },
];

// A generic PDCA reference template. Sub-stations are intentionally not seeded.
export const pdcaMajorEventTemplate = {
  model_key: 'pdca-major-event',
  name: '大事件 PDCA',
  description: 'PDCA 四阶段参考模板：计划、执行、检查、改善。子步骤由使用者维护，本迁移不预设。',
  stages: [
    { code: 'P', name: '计划', order: 1, stations: [] },
    { code: 'D', name: '执行', order: 2, stations: [] },
    { code: 'C', name: '检查', order: 3, stations: [] },
    { code: 'A', name: '改善', order: 4, stations: [] },
  ],
  version: 1,
  status: 'ACTIVE',
};

function findCollection(metadata, name) {
  return metadata.find((item) => item.name === name);
}
function findField(collection, name) {
  return (collection?.fields || []).find((field) => field.name === name);
}

// Large-station codes, in stage order -- the only part of a Stage Model this
// migration ever gets to have an opinion about. `stations`, `name`,
// `description` and `version` are Owner-authored data (project_stage_models
// has no write access below Owner -- see bootstrap/*-acl.json); an Owner
// editing the sub-stations of pdca-major-event, or bumping its
// version, is normal operation, not drift. Sorted by `order` rather than
// relying on array position, since NocoBase does not guarantee the stored
// array retains insertion order after an Owner edit.
export function stageCodesInOrder(stages) {
  return (stages || [])
    .slice()
    .sort((a, b) => (a?.order ?? 0) - (b?.order ?? 0))
    .map((stage) => stage?.code);
}
export function stageCodesMatch(expectedStages, actualStages) {
  const expected = stageCodesInOrder(expectedStages);
  const actual = stageCodesInOrder(actualStages);
  return expected.length === actual.length && expected.every((code, index) => code === actual[index]);
}

export async function migrateProjectStageModel({ request, listMeta }) {
  let metadata = await listMeta();

  if (!findCollection(metadata, 'project_stage_models')) {
    await request('collections:create', {
      method: 'POST',
      body: {
        name: 'project_stage_models',
        title: 'Project stage models',
        autoGenId: false,
        fields: stageModelFields,
        indexes: [{ name: 'project_stage_models_model_key_uk', fields: ['model_key'], unique: true }],
      },
    });
    metadata = await listMeta();
  }
  const stageModels = findCollection(metadata, 'project_stage_models');
  const stageModelNames = new Set((stageModels?.fields || []).map((field) => field.name));
  for (const required of ['model_key', 'name', 'description', 'stages', 'version', 'status']) {
    if (!stageModelNames.has(required)) throw new Error(projectStageModelMigrationId + ' did not provide project_stage_models.' + required + '.');
  }

  // projects.stage_model requires project_stage_models to already exist.
  const projects = findCollection(metadata, 'projects');
  if (!projects) throw new Error('Cannot apply ' + projectStageModelMigrationId + ': projects collection metadata is missing.');
  if (!findField(projects, projectStageModelField.name)) {
    await request('collections/projects/fields:create', { method: 'POST', body: projectStageModelField });
    metadata = await listMeta();
  }
  const verifiedProjects = findCollection(metadata, 'projects');
  const stageModelRelation = findField(verifiedProjects, projectStageModelField.name);
  if (
    stageModelRelation?.foreignKey !== projectStageModelField.foreignKey
    || stageModelRelation?.allowNull !== true
    || stageModelRelation?.target !== 'project_stage_models'
    || stageModelRelation?.onDelete !== 'SET NULL'
  ) {
    throw new Error(projectStageModelMigrationId + ' did not create the safe projects.stage_model relation.');
  }

  const reports = findCollection(metadata, 'project_reports');
  if (!reports) throw new Error('Cannot apply ' + projectStageModelMigrationId + ': project_reports collection metadata is missing.');
  for (const field of reportStructuredFields) {
    if (!findField(reports, field.name)) {
      await request('collections/project_reports/fields:create', { method: 'POST', body: field });
      metadata = await listMeta();
    }
  }
  const verifiedReports = findCollection(metadata, 'project_reports');
  for (const field of reportStructuredFields) {
    const actual = findField(verifiedReports, field.name);
    if (!actual) throw new Error(projectStageModelMigrationId + ' did not create project_reports.' + field.name + '.');
    if (actual.allowNull !== true) throw new Error(projectStageModelMigrationId + ' created project_reports.' + field.name + ' without nullability; every existing Report requires null.');
  }

  // Seed the first template, idempotent by model_key. This is Owner-authored
  // reference data (a page describing "what stages exist"), not fixture data
  // gated behind AISYS_BOOTSTRAP_SEED -- every environment needs the same
  // stage vocabulary to exist so a Project can be bound to it.
  //
  // Once a row with this model_key exists, this migration never writes to it
  // again -- not on create, not on update. An Owner filling in `stations`
  // (see the pdcaMajorEventTemplate comment above: the large P/D/C/A
  // stations start empty, small stations are a later, Owner-driven edit in
  // NocoBase) or bumping `version` must never be overwritten or mistaken for
  // drift by a later bootstrap run. The only thing this migration still
  // verifies is that the large-station spine (P, D, C, A, in order) the row
  // was seeded with is still the spine describing it -- that is a real
  // contract (existing Reports and stage_track reference these codes by
  // string), so a mismatch there still aborts.
  const existingList = await request('project_stage_models:list', {
    query: { paginate: 'false', 'filter[model_key]': pdcaMajorEventTemplate.model_key },
  });
  if (!(existingList.data || []).length) {
    await request('project_stage_models:create', { method: 'POST', body: pdcaMajorEventTemplate });
  }
  const seeded = (await request('project_stage_models:list', {
    query: { paginate: 'false', 'filter[model_key]': pdcaMajorEventTemplate.model_key },
  })).data?.[0];
  if (!seeded) throw new Error(projectStageModelMigrationId + ' did not seed the pdca-major-event template.');
  if (!stageCodesMatch(pdcaMajorEventTemplate.stages, seeded.stages)) {
    throw new Error(
      projectStageModelMigrationId + ' seeded pdca-major-event with unexpected stages: expected large-station codes ['
      + stageCodesInOrder(pdcaMajorEventTemplate.stages).join(',') + '] but found ['
      + stageCodesInOrder(seeded.stages).join(',') + '].',
    );
  }
}
