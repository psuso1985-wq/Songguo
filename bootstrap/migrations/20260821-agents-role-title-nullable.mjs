export const agentsRoleTitleNullableMigrationId = '20260821_agents_role_title_nullable';

export async function migrateAgentsRoleTitleNullable({ request, listMeta }) {
  const metadata = await listMeta();
  const agents = metadata.find((collection) => collection.name === 'agents');
  if (!agents) throw new Error('Cannot apply ' + agentsRoleTitleNullableMigrationId + ': agents collection metadata is missing.');

  const roleTitle = (agents.fields || []).find((field) => field.name === 'role_title');
  if (!roleTitle) throw new Error('Cannot apply ' + agentsRoleTitleNullableMigrationId + ': agents.role_title metadata is missing.');

  if (roleTitle.allowNull !== true) {
    await request('collections/agents/fields:update', {
      method: 'POST',
      query: { filterByTk: 'role_title' },
      body: { allowNull: true },
    });
  }

  const verified = (await listMeta())
    .find((collection) => collection.name === 'agents')
    ?.fields
    ?.find((field) => field.name === 'role_title');

  if (verified?.allowNull !== true) {
    throw new Error(agentsRoleTitleNullableMigrationId + ' did not make agents.role_title nullable.');
  }
}
