"use client";

import {
  deriveWorkspaceWorkline,
  type WorklineRecord,
} from "../../lib/workspace-v1/workline-view";

const statusText: Record<string, string> = {
  ACTIVE: "进行中",
  COMPLETED: "已完成",
  WAITING: "等待跟进",
  BLOCKED: "有阻碍",
  OPEN: "待执行",
  IN_PROGRESS: "执行中",
  WAITING_REVIEW: "等待验收",
  NEEDS_REVISION: "待修订",
  UNKNOWN: "尚未确认",
};

function readable(value: string) {
  return statusText[value] || value;
}

function deadline(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "截止时间待核实"
    : parsed.toLocaleString("zh-CN", { hour12: false });
}

export function WorkspaceWorkline({
  project,
  tasks,
  reports,
  ownerName,
}: {
  project: WorklineRecord;
  tasks: WorklineRecord[];
  reports: WorklineRecord[];
  ownerName: string;
}) {
  const board = deriveWorkspaceWorkline(project, tasks, reports);
  const { counts } = board;
  return (
    <section id="workspace-workline" aria-label="项目工作板" className="ws-panel ws-workline">
      <div className="ws-workline-head">
        <div>
          <p className="ws-workline-kicker">WORKLINE · 项目事实视图</p>
          <h2>项目工作板</h2>
          <p className="ws-muted">直接读取当前工作空间的正式记录，不另建进度台账。</p>
        </div>
        <span className="ws-status">{readable(board.projectStatus)}</span>
      </div>

      <dl className="ws-workline-metrics">
        <div>
          <dt>当前阶段</dt>
          <dd>{board.phase || "待确认"}</dd>
          <small>阶段状态：{readable(board.phaseStatus)}</small>
        </div>
        <div>
          <dt>已验收工作</dt>
          <dd>{counts.completed} / {counts.total}</dd>
          <small>工作成果接受不代表项目完成</small>
        </div>
        <div>
          <dt>待决定 / 待修订</dt>
          <dd>{counts.waitingReview} / {counts.needsRevision}</dd>
          <small>分别由验收人决定、执行人修订</small>
        </div>
        <div>
          <dt>成果与证据</dt>
          <dd>{board.submittedVersions} / {board.referencedEvidenceResources}</dd>
          <small>成果版本 / 已关联证据资源（非质量等级）</small>
        </div>
      </dl>

      <div className="ws-workline-core">
        <div>
          <h3>目标与当前判断</h3>
          <p className="ws-workline-label">项目目标</p>
          <p className="ws-pre">{board.goal || "目标待记录"}</p>
          <p className="ws-workline-label">验收标准</p>
          <p className="ws-pre">{board.acceptance || "验收标准待记录"}</p>
          <p className="ws-workline-label">当前进展</p>
          <p className="ws-pre">{board.summary || "尚未记录当前进展"}</p>
        </div>
        <div>
          <h3>风险与下一步</h3>
          <p className="ws-workline-label">阻碍 / 风险信号</p>
          <p className="ws-pre">{board.blocker || (counts.overdue ? "存在逾期工作项，尚未登记项目阻碍。" : "暂无已登记的项目阻碍")}</p>
          {counts.overdue > 0 && (
            <p className="ws-workline-attention">现有 {counts.overdue} 项未完成工作已超过登记的截止时间。</p>
          )}
          <p className="ws-workline-label">下一步</p>
          <p className="ws-pre">{board.nextAction || "下一步待项目负责人确认"}</p>
          <p className="ws-muted">项目负责人：{ownerName || "尚未指定"}</p>
        </div>
      </div>

      <div className="ws-workline-core">
        <div>
          <h3>已登记的工作截止时间</h3>
          {board.datedTasks.length ? (
            <ol className="ws-workline-timeline">
              {board.datedTasks.map((task) => (
                <li key={task.id}>
                  <span className="ws-workline-date">{deadline(task.dueAt!)}</span>
                  <a href={"#task-" + task.id}>{task.title}</a>
                  <span className="ws-muted">{readable(task.status)}{task.overdue ? " · 已逾期" : ""}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ws-muted">目前没有登记了有效截止时间的工作项。</p>
          )}
          {board.undatedTasks > 0 && (
            <p className="ws-muted">另有 {board.undatedTasks} 项工作未登记有效截止时间，可在“工作与交接”查看。</p>
          )}
          <p className="ws-muted">这里仅按真实工作截止时间排序；开始日期、阶段基线与依赖尚未登记，因此不生成虚构甘特图。</p>
        </div>
        <div>
          <h3>验收关口</h3>
          <p className="ws-workline-gate">{board.gate}</p>
          <p className="ws-muted">阶段状态、单项工作验收和整个项目完成，必须分别记录。</p>
          <nav aria-label="工作板详情导航" className="ws-workline-links">
            <a href="#workspace-project-facts">项目事实与更新</a>
            <a href="#workspace-work-items">工作与交接</a>
            <a href="#workspace-history">成果与决策历史</a>
          </nav>
        </div>
      </div>
    </section>
  );
}
