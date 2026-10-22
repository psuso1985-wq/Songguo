export const orgNoticesMigrationId = '20260901_org_notices';

// Bootstrap is the one touchpoint every Agent Session already passes through
// before it starts work (docs/agent-bootstrap-protocol-v1.md). A notice
// board riding on that single choke point gets baseline all-Agent coverage
// for free, with no second channel to keep alive.
//
// This is a bulletin board, not Work Mail: no read receipt, no per-recipient
// row, no inbox, no push. "Who has not seen it yet" is an organizational
// question the Owner answers by requiring an Agent to cite the notice number
// it acted on in its next Report -- not a mechanism this collection builds.
// The Owner edits this collection directly in the NocoBase admin UI; there
// is no approval workflow.
const fields = [
  { name: 'id', title: 'ID', type: 'bigInt', interface: 'integer', primaryKey: true, autoIncrement: true, allowNull: false },
  { name: 'createdAt', title: 'Created at', type: 'date', interface: 'createdAt', allowNull: true },
  { name: 'updatedAt', title: 'Updated at', type: 'date', interface: 'updatedAt', allowNull: true },
  { name: 'notice_no', title: 'Notice number', type: 'integer', interface: 'integer', allowNull: false },
  { name: 'title', title: 'Title', type: 'string', interface: 'input', allowNull: false },
  { name: 'content', title: 'Content', type: 'text', interface: 'textarea', allowNull: false },
  { name: 'effective_from', title: 'Effective from', type: 'date', interface: 'datetime', allowNull: false, timezone: true },
  { name: 'expires_at', title: 'Expires at', type: 'date', interface: 'datetime', allowNull: true, timezone: true },
  { name: 'audience', title: 'Audience', type: 'string', interface: 'select', allowNull: false, defaultValue: 'ALL',
    uiSchema: { type: 'string', title: 'Audience', 'x-component': 'Select', enum: ['ALL', 'CODEX', 'CLAUDE_CODE'].map((value) => ({ label: value, value })) } },
  { name: 'status', title: 'Status', type: 'string', interface: 'select', allowNull: false, defaultValue: 'ACTIVE',
    uiSchema: { type: 'string', title: 'Status', 'x-component': 'Select', enum: ['ACTIVE', 'RETIRED'].map((value) => ({ label: value, value })) } },
];

export async function migrateOrgNotices({ request, listMeta }) {
  const meta = await listMeta();
  if (!meta.some((item) => item.name === 'org_notices')) {
    await request('collections:create', {
      method: 'POST',
      body: {
        name: 'org_notices',
        title: 'Organization notices',
        autoGenId: false,
        fields,
        indexes: [{ name: 'org_notices_notice_no_uk', fields: ['notice_no'], unique: true }],
      },
    });
  }
  const created = (await listMeta()).find((item) => item.name === 'org_notices');
  const names = new Set((created?.fields || []).map((field) => field.name));
  for (const required of ['notice_no', 'title', 'content', 'effective_from', 'expires_at', 'audience', 'status']) {
    if (!names.has(required)) throw new Error(orgNoticesMigrationId + ' did not provide org_notices.' + required + '.');
  }
}
