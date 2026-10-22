// This is a read-only view of facts already scoped by Workspace V1.
// It never invents stages, a schedule baseline, evidence quality or completion.
export type WorklineRecord = Record<string, unknown>;

const value = (field: unknown): string =>
  field == null ? "" : String(field).trim();

export type WorklineTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
  overdue: boolean;
};

export function deriveWorkspaceWorkline(
  project: WorklineRecord,
  tasks: WorklineRecord[],
  reports: WorklineRecord[],
  now = Date.now(),
) {
  const projectId = value(project.id);
  const projectTasks = projectId
    ? tasks.filter((task) => value(task.project_id) === projectId)
    : [];
  const taskIds = new Set(projectTasks.map((task) => value(task.id)));
  const items: WorklineTask[] = projectTasks.map((task) => {
    const status = value(task.effective_status) || value(task.status) || "UNKNOWN";
    const rawDue = value(task.due_at);
    const dueTime = rawDue ? Date.parse(rawDue) : NaN;
    const dueAt = Number.isFinite(dueTime) ? rawDue : null;
    return {
      id: value(task.id),
      title: value(task.title) || "未命名工作项",
      status,
      dueAt,
      overdue: dueAt !== null && status !== "COMPLETED" && dueTime < now,
    };
  });
  const datedTasks = items
    .filter((task) => task.dueAt !== null)
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!) || a.id.localeCompare(b.id));
  const submittedVersions = reports.filter(
    (report) =>
      value(report.project_id) === projectId &&
      projectId !== "" &&
      taskIds.has(value(report.task_id)) &&
      ["PROGRESS", "CORRECTION"].includes(value(report.report_type)),
  );
  const evidenceResources = new Set<string>();
  let evidenceVersions = 0;
  for (const report of submittedVersions) {
    const references = Array.isArray(report.evidence_resource_ids)
      ? report.evidence_resource_ids.map(value).filter(Boolean)
      : [];
    if (references.length) evidenceVersions++;
    for (const reference of references) evidenceResources.add(reference);
  }

  const total = items.length;
  const completed = items.filter((task) => task.status === "COMPLETED").length;
  const waitingReview = items.filter((task) => task.status === "WAITING_REVIEW").length;
  const needsRevision = items.filter((task) => task.status === "NEEDS_REVISION").length;
  const overdue = items.filter((task) => task.overdue).length;
  const projectStatus = value(project.status) || "UNKNOWN";
  const gate =
    projectStatus === "COMPLETED"
      ? "整个项目已经过负责人明确确认完成。"
      : total === 0
        ? "尚未创建工作项，项目收尾条件尚不具备。"
        : completed === total
          ? "所有工作成果已接受，仍需项目负责人单独确认项目完成。"
          : waitingReview > 0
            ? String(waitingReview) + " 项成果等待指定验收人或项目负责人决定。"
            : needsRevision > 0
              ? String(needsRevision) + " 项成果已退回，等待追加修订与再次验收。"
              : "工作尚未全部验收，不能据此认定项目完成。";

  return {
    projectStatus,
    phase: value(project.phase) || null,
    phaseStatus: value(project.phase_status) || "UNKNOWN",
    goal: value(project.goal) || null,
    acceptance: value(project.acceptance_criteria) || null,
    summary: value(project.current_summary) || null,
    nextAction: value(project.next_action) || null,
    blocker: value(project.blocker) || null,
    counts: { total, completed, waitingReview, needsRevision, overdue },
    submittedVersions: submittedVersions.length,
    evidenceVersions,
    referencedEvidenceResources: evidenceResources.size,
    datedTasks,
    undatedTasks: total - datedTasks.length,
    gate,
  };
}
