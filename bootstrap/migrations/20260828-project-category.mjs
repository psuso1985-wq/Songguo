export const projectCategoryMigrationId = '20260828_project_category';

// Versioned project category vocabulary. Unclassified projects remain nullable;
// category values and their display labels are reconciled without changing records.
export const projectCategories = [
  { value: 'SYSTEM', label: '系统建设' },
  { value: 'SOFTWARE', label: '软件开发' },
  { value: 'BUSINESS', label: '业务项目' },
  { value: 'MAJOR_EVENT', label: '大事件' },
  { value: 'DEPARTMENT_GOAL', label: '科室目标' },
];

export const projectCategoryField = {
  name: 'category', title: 'Category', type: 'string', interface: 'select', allowNull: true,
  uiSchema: {
    type: 'string', title: 'Category', 'x-component': 'Select',
    enum: projectCategories.map(({ value, label }) => ({ label, value })),
  },
};

export async function migrateProjectCategory({ request, listMeta }) {
  const projects = (await listMeta()).find((item) => item.name === 'projects');
  if (!projects) throw new Error(projectCategoryMigrationId + ' requires the projects collection.');
  if (!(projects.fields || []).some((field) => field.name === projectCategoryField.name)) {
    await request('collections/projects/fields:create', { method: 'POST', body: projectCategoryField });
  }
  // Reconcile metadata when a field predates the current category vocabulary.
  const existing = (await listMeta()).find((item) => item.name === 'projects');
  const field = (existing?.fields || []).find((item) => item.name === projectCategoryField.name);
  if (!field) throw new Error(projectCategoryMigrationId + ' did not provide projects.category.');
  const knownValues = projectCategories.map((category) => category.value);
  const options = field.uiSchema?.enum || [];
  for (const option of options) {
    // Refuse unknown values rather than accepting or dropping unversioned data.
    if (!knownValues.includes(option.value)) {
      throw new Error(projectCategoryMigrationId + ' found unversioned projects.category value ' + option.value + '.');
    }
  }
  const canonicalEnum = projectCategories.map(({ value, label }) => ({ label, value }));
  const matchesCanonical = options.length === canonicalEnum.length
    && canonicalEnum.every((entry, index) => options[index]?.value === entry.value && options[index]?.label === entry.label);
  if (!matchesCanonical) {
    await request('collections/projects/fields:update', {
      method: 'POST',
      query: { filterByTk: projectCategoryField.name },
      body: { name: projectCategoryField.name, uiSchema: { ...(field.uiSchema || {}), enum: canonicalEnum } },
    });
  }
}
