export const agentStageEventsMigrationId = '20260902_agent_stage_events';

// Lightweight stage observations are separate from formal project reports.
// A project must have a stage model; a station is optional for stage-only entries.
export const agentStageEventFields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'project', title: 'Project', type: 'belongsTo', interface: 'm2o', target: 'projects', foreignKey: 'project_id', targetKey: 'id', allowNull: false },
  { name: 'stage_code', title: 'Stage code', type: 'string', interface: 'input', allowNull: false },
  { name: 'station_code', title: 'Station code', type: 'string', interface: 'input', allowNull: true },
  { name: 'entered_at', title: 'Entered at', type: 'date', interface: 'datetime', allowNull: false, timezone: true },
  { name: 'recorded_at', title: 'Recorded at', type: 'date', interface: 'datetime', allowNull: false, timezone: true },
  { name: 'note', title: 'Note', type: 'string', interface: 'input', allowNull: true },
  { name: 'submitted_by', title: 'Submitted by', type: 'belongsTo', interface: 'm2o', target: 'agents', foreignKey: 'submitted_by_id', targetKey: 'id', allowNull: false },
  // A submission is `backfilled` when the caller reports entering a stage
  // well after the fact (POST /api/agent-stage-events: entered_at more than
  // five minutes before recorded_at) -- e.g. a Project's work log filled in
  // after the work happened. Never inferred beyond that window, never
  // recomputed after the row is written.
  { name: 'backfilled', title: 'Backfilled', type: 'boolean', interface: 'checkbox', allowNull: false, defaultValue: false },
  // Required, not merely present: every caller must supply one, and
  // uniqueness is enforced at creation (no pre-existing rows to accommodate,
  // unlike project_reports.idempotency_key -- see
  // bootstrap/migrations/20260822-report-idempotency.mjs).
  { name: 'idempotency_key', title: 'Idempotency key', type: 'string', interface: 'input', allowNull: false },
  // Same purpose as project_reports.request_fingerprint
  // (bootstrap/migrations/20260822-report-idempotency.mjs): a replayed
  // idempotency_key is only ever a true replay if the rest of the request
  // also matches. Always populated -- idempotency_key itself is required
  // here, unlike on project_reports.
  { name: 'request_fingerprint', title: 'Request fingerprint', type: 'string', interface: 'input', allowNull: false },
];

function findCollection(metadata, name) {
  return metadata.find((item) => item.name === name);
}
function findField(collection, name) {
  return (collection?.fields || []).find((field) => field.name === name);
}

export async function migrateAgentStageEvents({ request, listMeta }) {
  let metadata = await listMeta();

  if (!findCollection(metadata, 'project_stage_events')) {
    await request('collections:create', {
      method: 'POST',
      body: {
        name: 'project_stage_events',
        title: 'Project stage events',
        autoGenId: false,
        fields: agentStageEventFields,
        indexes: [{ name: 'project_stage_events_idempotency_key_uk', fields: ['idempotency_key'], unique: true }],
      },
    });
    metadata = await listMeta();
  }

  const collection = findCollection(metadata, 'project_stage_events');
  if (!collection) throw new Error(agentStageEventsMigrationId + ' did not create project_stage_events.');
  for (const field of agentStageEventFields) {
    const actual = findField(collection, field.name);
    if (!actual) throw new Error(agentStageEventsMigrationId + ' did not provide project_stage_events.' + field.name + '.');
    if (Boolean(actual.allowNull) !== Boolean(field.allowNull)) {
      throw new Error(agentStageEventsMigrationId + ' created project_stage_events.' + field.name + ' with unexpected nullability.');
    }
  }
}
