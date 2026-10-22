// Pure projection shared by the public API and acceptance tests. A Decision
// accepts exactly one submitted version; project lifecycle is independent.
export type RecordRow = Record<string, unknown>;
const equal = (a: unknown, b: unknown) =>
  a != null && b != null && String(a) === String(b);
export function taskProjection(task: RecordRow, reports: RecordRow[]) {
  const history = reports.filter((r) => equal(r.task_id, task.id));
  const versions = history.filter((r) =>
    ["PROGRESS", "CORRECTION"].includes(String(r.report_type)),
  );
  const latest = versions.at(-1);
  const decision = latest
    ? history.find(
        (r) =>
          equal(r.reviewed_report_id, latest.id) &&
          r.report_type === "DECISION",
      )
    : undefined;
  return {
    ...task,
    completed_at:
      decision?.decision_outcome === "ACCEPT" ? decision.submitted_at : null,
    effective_status: latest
      ? decision?.decision_outcome === "ACCEPT"
        ? "COMPLETED"
        : decision?.decision_outcome === "RETURN"
          ? "NEEDS_REVISION"
          : "WAITING_REVIEW"
      : task.status,
    latest_report_id: latest?.id ?? null,
    latest_decision_id: decision?.id ?? null,
    latest_decision: decision?.decision_outcome ?? null,
  };
}
export function projectProjection(project: RecordRow, reports: RecordRow[]) {
  const changes = reports.filter(
    (r) => equal(r.project_id, project.id) && r.report_type === "PROJECT_EVENT",
  );
  const last = changes.at(-1);
  const details = last?.structured as RecordRow | undefined;
  return {
    ...project,
    ...(details
      ? {
          phase: details.phase,
          phase_status: details.phase_status ?? project.phase_status ?? "ACTIVE",
          status: details.status,
          current_summary: details.current_summary,
          next_action: details.next_action,
          blocker: details.blocker,
          ...(details.name
            ? {
                name: details.name,
                goal: details.goal,
                acceptance_criteria: details.acceptance_criteria,
              }
            : {}),
        }
      : {}),
    phase_status: details?.phase_status ?? project.phase_status ?? "ACTIVE",
    completed_at:
      details?.status === "COMPLETED"
        ? last?.submitted_at
        : project.completed_at,
  };
}
