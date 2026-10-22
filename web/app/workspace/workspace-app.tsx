"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "../components/app-shell";
import { clientId } from "../../lib/client-id";
import { WorkspaceMethodsGuide } from "./workspace-methods";
import { WorkspaceWorkline } from "./workspace-workline";

type Item = Record<string, unknown>;
type User = { id: string; name: string; email: string };
type Data = {
  workspace: Item;
  me: User;
  role: string;
  members: Item[];
  agents: Item[];
  projects: Item[];
  tasks: Item[];
  resources: Item[];
  reports: Item[];
  events: Item[];
  invitations: Item[];
  agent_members: Item[];
  user_members: Item[];
};
type Session = { user: User | null; workspaces: Item[] };
const str = (v: unknown) => (v == null ? "" : String(v));
const eq = (a: unknown, b: unknown) => str(a) !== "" && str(a) === str(b);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str) : []);
const date = (v: unknown) =>
  v ? new Date(str(v)).toLocaleString("zh-CN", { hour12: false }) : "未设置";
const labels: Record<string, string> = {
  OPEN: "待执行",
  IN_PROGRESS: "执行中",
  WAITING_REVIEW: "等待验收",
  NEEDS_REVISION: "待修订",
  COMPLETED: "已完成",
  ACTIVE: "进行中",
  WAITING: "等待跟进",
  BLOCKED: "有阻碍",
  NOT_CONNECTED: "未连接",
  AVAILABLE: "可用",
  RUNNING: "执行中",
  ERROR: "异常",
  PENDING: "待加入",
  ACCEPTED: "已加入",
  REVOKED: "已撤销",
  EXPIRED: "已过期",
  PROGRESS: "成果提交",
  CORRECTION: "修订成果",
  DECISION: "验收决定",
  PROJECT_EVENT: "项目进展",
  ACCEPT: "接受",
  RETURN: "退回",
  TASK_STARTED: "工作开始",
  AGENT_CONNECTED: "Agent 已连接",
  AGENT_REVOKED: "Agent 连接已撤销",
  INVITATION_PENDING: "邀请已发出",
  INVITATION_ACCEPTED: "邀请已接受",
  INVITATION_REVOKED: "邀请已撤销",
  INVITATION_EXPIRED: "邀请已过期",
};
function Status({ value }: { value: unknown }) {
  const v = str(value);
  return (
    <span
      className={
        "ws-status " +
        (["COMPLETED", "AVAILABLE", "ACCEPT", "ACCEPTED"].includes(v)
          ? "ok"
          : ["ERROR", "BLOCKED", "RETURN"].includes(v)
            ? "danger"
            : ["NOT_CONNECTED", "WAITING_REVIEW", "NEEDS_REVISION"].includes(v)
              ? "warn"
              : "")
      }
    >
      {labels[v] || v || "未设置"}
    </span>
  );
}
async function api(path: string, body?: Item | FormData): Promise<Item> {
  const response = await fetch("/api/v1/" + path, {
    method: body ? "POST" : "GET",
    ...(body
      ? {
          body: body instanceof FormData ? body : JSON.stringify(body),
          headers:
            body instanceof FormData
              ? {}
              : { "Content-Type": "application/json" },
        }
      : {}),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(str(data.error) || "操作未完成，请稍后重试。");
  return data;
}
function Field({
  label,
  name,
  kind = "text",
  required = true,
  value,
  hint,
  minLength,
}: {
  label: string;
  name: string;
  kind?: string;
  required?: boolean;
  value?: string;
  hint?: string;
  minLength?: number;
}) {
  return (
    <label className="ws-field">
      <span>
        {label}
        {!required && "（选填）"}
      </span>
      {kind === "textarea" ? (
        <textarea
          aria-label={label + (!required ? "（选填）" : "")}
          name={name}
          required={required}
          defaultValue={value}
          rows={3}
          maxLength={12000}
        />
      ) : (
        <input
          aria-label={label + (!required ? "（选填）" : "")}
          name={name}
          type={kind}
          required={required}
          defaultValue={value}
          maxLength={kind === "password" ? 256 : 4000}
          {...(kind === "password"
            ? { minLength, autoComplete: "current-password" }
            : {})}
        />
      )}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function MemberSelect({
  data,
  label,
  name,
  value,
}: {
  data: Data;
  label: string;
  name: string;
  value?: string;
}) {
  return (
    <label className="ws-field">
      <span>{label}</span>
      <select
        aria-label={label}
        name={name}
        defaultValue={value || data.me.id}
        required
      >
        {data.members.map((m) => (
          <option key={str(m.id)} value={str(m.user_id)}>
            {str(m.display_name)}
            {m.role === "OWNER" ? " · 工作空间负责人" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
function ResourceChecks({
  resources,
  name,
  selected = [],
}: {
  resources: Item[];
  name: string;
  selected?: string[];
}) {
  return (
    <fieldset className="ws-checks">
      <legend>
        {name === "evidence_resource_ids"
          ? "成果证据 / 交付文件（至少一条）"
          : "参考资料"}
      </legend>
      {resources.length ? (
        resources.map((r) => (
          <label key={str(r.id)}>
            <input
              type="checkbox"
              name={name}
              value={str(r.id)}
              defaultChecked={selected.includes(str(r.id))}
            />
            {str(r.name)}
          </label>
        ))
      ) : (
        <p className="ws-muted">先在项目「资料」中加入文件或链接。</p>
      )}
    </fieldset>
  );
}
type FormProps = {
  children: ReactNode;
  submit: string;
  action: (body: Item, form: HTMLFormElement) => Promise<void>;
  reset?: boolean;
  className?: string;
};
function ActionForm({
  children,
  submit,
  action,
  reset = false,
  className = "",
}: FormProps) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState("");
  const operation = useRef(clientId());
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError("");
    setDone("");
    const fd = new FormData(form),
      body: Item = Object.fromEntries(fd.entries());
    for (const name of ["input_resource_ids", "evidence_resource_ids"])
      body[name] = fd.getAll(name).map(str);
    body.operation_key = operation.current;
    try {
      await action(body, form);
      operation.current = clientId();
      if (reset) form.reset();
      setDone("已保存");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败，输入已保留。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={"ws-form " + className} onSubmit={(e) => void send(e)}>
      {children}
      <div className="ws-actions">
        <button disabled={busy} type="submit" className="ws-primary">
          {busy ? "正在保存…" : submit}
        </button>
        {done && <span role="status">{done}</span>}
      </div>
      {error && (
        <p className="ws-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
function Panel({
  title,
  children,
  action,
  id,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="ws-panel">
      <div className="ws-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function WorkspaceApp() {
  const router = useRouter(),
    params = useSearchParams();
  const [session, setSession] = useState<Session | null>(null),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState("");
  const loadEpoch = useRef(0);
  const [inviteUrl, setInviteUrl] = useState(""),
    [connection, setConnection] = useState<Item | null>(null),
    [register, setRegister] = useState(true);
  const workspaceKey =
      params.get("workspace") || str(session?.workspaces[0]?.workspace_key),
    view = params.get("view") || "desk",
    inviteToken = params.get("invite");
  const route = useCallback(
    (next: string, project?: unknown, workspace?: string) => {
      const q = new URLSearchParams();
      if (workspace || workspaceKey)
        q.set("workspace", workspace || workspaceKey);
      q.set("view", next);
      if (project) q.set("project", str(project));
      router.push("/workspace?" + q.toString());
    },
    [router, workspaceKey],
  );
  const loadSession = useCallback(async () => {
    const s = (await api("auth/session")) as unknown as Session;
    setSession(s);
    return s;
  }, []);
  const load = useCallback(async () => {
    if (!workspaceKey || !session?.user) return;
    const epoch = ++loadEpoch.current;
    setError("");
    try {
      const loaded = (await api(
        "workspaces/" + workspaceKey,
      )) as unknown as Data;
      if (epoch === loadEpoch.current) setData(loaded);
    } catch (e) {
      if (epoch === loadEpoch.current) {
        setData((previous) =>
          str(previous?.workspace.workspace_key) === workspaceKey
            ? previous
            : null,
        );
        setError(e instanceof Error ? e.message : "读取失败。");
      }
    }
  }, [workspaceKey, session?.user]);
  useEffect(() => {
    void loadSession().catch((e) => setError(e.message));
  }, [loadSession]);
  useEffect(() => {
    setData(null);
    setInviteUrl("");
    setConnection(null);
    void load();
  }, [load, view]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function save(path: string, body: Item | FormData) {
    const result = await api("workspaces/" + workspaceKey + "/" + path, body);
    await load();
    return result;
  }
  async function step(next: string) {
    await save("setup", { step: next });
  }
  const href = (next: string, project?: unknown) =>
    "/workspace?" +
    new URLSearchParams({
      workspace: workspaceKey,
      view: next,
      ...(project ? { project: str(project) } : {}),
    });
  const userName = (userId: unknown) =>
    str(data?.members.find((m) => eq(m.user_id, userId))?.display_name) ||
    "未指定";
  const agentName = (agentId: unknown) =>
    str(data?.agents.find((a) => eq(a.id, agentId))?.name) || "未指定";
  const executorName = (task: Item) =>
    task.holder_agent_id
      ? agentName(task.holder_agent_id) + " · Agent"
      : userName(task.executor_user_id);
  if (!session && !error)
    return <p className="ws-loading">正在打开工作空间…</p>;
  if (!session?.user)
    return (
      <main className="ws-welcome">
        <div className="ws-intro">
          <span className="ws-kicker">松果智序 AI 平台</span>
          <h1>
            把自己的工作，
            <br />
            真正做完。
          </h1>
          <p>
            与你的同事和记名
            Agent，在私有工作空间中整理资料、交接工作，并保留每一次交付与验收。
          </p>
          <ol>
            <li>创建自己的工作空间</li>
            <li>邀请同事，登记 Agent</li>
            <li>带上资料，完成可验收项目</li>
          </ol>
          <a
            href="https://songguo-zhixu-demo.psuso1985.chatgpt.site"
            target="_blank"
            rel="noopener noreferrer"
          >
            体验示例 → <small>演示数据，独立于我的工作空间</small>
          </a>
        </div>
        <section className="ws-auth">
          <h2>{register ? "创建你的账号" : "登录我的工作空间"}</h2>
          {inviteToken && (
            <p className="ws-notice">
              你正在接受团队邀请，请使用收到邀请的邮箱。
            </p>
          )}
          <ActionForm
            key={String(register)}
            submit={register ? "注册并开始" : "登录"}
            action={async (body) => {
              await api("auth/" + (register ? "register" : "login"), body);
              await loadSession();
            }}
          >
            {register && <Field label="你的姓名" name="name" />}
            <Field label="邮箱" name="email" kind="email" />
            <Field
              label="密码"
              name="password"
              kind="password"
              minLength={register ? 12 : undefined}
              hint={register ? "至少 12 个字符" : undefined}
            />
            {!register && <p className="ws-muted">请使用注册时的密码。</p>}
          </ActionForm>
          <button className="ws-link" onClick={() => setRegister(!register)}>
            {register ? "已有账号？登录" : "没有账号？注册"}
          </button>
          {error && (
            <p role="alert" className="ws-error">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  if (inviteToken)
    return (
      <main className="ws-onboard">
        <Panel title="加入同事的工作空间">
          <p>
            当前账号：{session.user.name} · {session.user.email}
          </p>
          <p>加入后，你可以访问这个团队的私有项目与资料。</p>
          <ActionForm
            submit="接受邀请"
            action={async () => {
              const result = await api("invitations/accept", {
                token: inviteToken,
              });
              await loadSession();
              route(
                "desk",
                undefined,
                str((result.workspace as Item).workspace_key),
              );
            }}
          >
            <p className="ws-muted">邀请仅供指定邮箱使用，有效期为 7 天。</p>
          </ActionForm>
          <button
            className="ws-link"
            onClick={async () => {
              await api("auth/logout", {});
              setSession({ user: null, workspaces: [] });
            }}
          >
            切换账号
          </button>
        </Panel>
      </main>
    );
  const newWorkspace = view === "new-workspace" || !session.workspaces.length;
  if (newWorkspace)
    return (
      <main className="ws-onboard">
        <span className="ws-kicker">首次初始化 · 第 1 步</span>
        <h1>先给你的工作一个家</h1>
        <p>项目、Agent、资料和成果默认私有，只有工作空间成员能够访问。</p>
        <Panel title="创建工作空间">
          <ActionForm
            submit="创建工作空间"
            action={async (body) => {
              const result = await api("workspaces", body);
              await loadSession();
              route(
                "setup",
                undefined,
                str((result.workspace as Item).workspace_key),
              );
            }}
          >
            <Field label="工作空间名称" name="name" />
            <label className="ws-field">
              <span>我是</span>
              <select aria-label="我是" name="team_type">
                <option value="TEAM">小团队负责人</option>
                <option value="PERSONAL">个人负责人</option>
              </select>
            </label>
            <Field
              label="团队 / 个人简介"
              name="description"
              kind="textarea"
              required={false}
            />
          </ActionForm>
        </Panel>
        {session.workspaces.length > 0 && (
          <button onClick={() => route("desk")} className="ws-link">
            返回已有工作空间
          </button>
        )}
      </main>
    );
  if (
    !data ||
    !eq(data.me.id, session.user.id) ||
    str(data.workspace.workspace_key) !== workspaceKey
  )
    return (
      <main className="ws-onboard">
        {error ? (
          <>
            <p className="ws-error" role="alert">
              {error}
            </p>
            <button className="ws-primary" onClick={() => void load()}>
              重新读取
            </button>
            <Link href="/workspace">返回我的工作空间</Link>
          </>
        ) : (
          <p>正在读取你的工作空间…</p>
        )}
      </main>
    );
  const owner = data.role === "OWNER",
    setupNeeded = owner && !data.workspace.setup_completed_at;
  const wizard = setupNeeded || view === "setup";
  const setupStep =
    str(data.workspace.setup_step) === "DONE"
      ? "CHECK"
      : str(data.workspace.setup_step);
  const selectedProject = data.projects.find((p) =>
    eq(p.id, params.get("project")),
  );
  const projectForm = (
    <ActionForm
      submit="创建项目"
      reset
      action={async (body) => {
        const project = await save("projects", body);
        if (wizard) await step("AGENT");
        else route("projects", project.id);
      }}
    >
      <Field label="项目名称" name="name" />
      <Field label="项目目标" name="goal" kind="textarea" />
      <Field
        label="验收标准"
        name="acceptance_criteria"
        kind="textarea"
        hint="写清什么成果算合格，方便团队交付与验收。"
      />
      <MemberSelect data={data} label="项目 Owner" name="owner_user_id" />
    </ActionForm>
  );
  const agentForm = (
    <ActionForm
      submit="登记 Agent"
      reset
      action={async (body) => {
        await save("agents", body);
        if (wizard) await step("CHECK");
      }}
    >
      <Field label="Agent 名称" name="name" />
      <MemberSelect data={data} label="人类负责人" name="responsible_user_id" />
      <Field label="职责与能力" name="responsibilities" kind="textarea" />
      <Field label="需要的输入" name="standard_inputs" kind="textarea" />
      <Field label="会产出什么" name="standard_outputs" kind="textarea" />
      <p className="ws-notice">
        登记后状态为「未连接」。你可以先为它安排工作，由人类负责人交接；实际连接后才能通过松果接口读取和提交。
      </p>
    </ActionForm>
  );
  const inviteForm = (
    <>
      <ActionForm
        submit="生成邀请链接"
        reset
        action={async (body) => {
          const result = await save("invitations", body);
          setInviteUrl(str(result.invite_url));
        }}
      >
        <Field label="同事邮箱" name="email" kind="email" />
      </ActionForm>
      {inviteUrl && (
        <div className="ws-notice" role="status">
          <p>把此链接发给这位同事。7 天内有效，仅限指定邮箱。</p>
          <label className="ws-field">
            <span>邀请链接（仅显示这一次）</span>
            <input
              readOnly
              value={inviteUrl}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            type="button"
            className="ws-secondary"
            onClick={() => void navigator.clipboard.writeText(inviteUrl)}
          >
            复制链接
          </button>
        </div>
      )}
    </>
  );
  if (wizard)
    return (
      <main className="ws-onboard">
        <div className="ws-section-head">
          <span className="ws-kicker">
            {str(data.workspace.name)} · 我的私有工作空间
          </span>
          <Link href={href("desk")}>工作台</Link>
        </div>
        <h1>开始你的第一个真实项目</h1>
        <ol className="ws-steps">
          {["工作空间", "邀请同事", "创建项目", "登记 Agent", "完成检查"].map(
            (s, index) => (
              <li
                key={s}
                aria-current={
                  index ===
                  ({ TEAM: 1, PROJECT: 2, AGENT: 3, CHECK: 4 }[setupStep] || 4)
                    ? "step"
                    : undefined
                }
              >
                {index + 1}. {s}
              </li>
            ),
          )}
        </ol>
        {setupStep === "TEAM" ? (
          <Panel title="邀请一位同事">
            {inviteForm}
            <button
              className="ws-secondary"
              onClick={() => void step("PROJECT")}
            >
              {inviteUrl || data.invitations.length
                ? "继续创建项目"
                : "稍后邀请，继续创建项目"}
            </button>
          </Panel>
        ) : setupStep === "PROJECT" ? (
          <Panel title="明确你要完成的工作">
            {data.projects.length ? (
              <>
                <p>已创建 {str(data.projects[0].name)}</p>
                <button
                  className="ws-primary"
                  onClick={() => void step("AGENT")}
                >
                  继续登记 Agent
                </button>
              </>
            ) : (
              projectForm
            )}
          </Panel>
        ) : setupStep === "AGENT" ? (
          <Panel title="登记一个长期存在的 AI 工作角色">
            {data.agents.length ? (
              <>
                <p>已登记 {str(data.agents[0].name)} · 未连接</p>
                <button
                  className="ws-primary"
                  onClick={() => void step("CHECK")}
                >
                  完成检查
                </button>
              </>
            ) : (
              agentForm
            )}
          </Panel>
        ) : (
          <Panel title="你的工作空间已准备好">
            <ul className="ws-checklist">
              <li>私有工作空间：{str(data.workspace.name)}</li>
              <li>
                团队：{data.members.length} 位成员，
                {
                  data.invitations.filter((i) => i.status === "PENDING").length
                }{" "}
                份待加入邀请
              </li>
              <li>
                项目：
                {data.projects.map((p) => str(p.name)).join("、") || "尚未创建"}
              </li>
              <li>
                记名 Agent：
                {data.agents.map((a) => str(a.name)).join("、") || "尚未登记"} ·
                未连接
              </li>
            </ul>
            <p className="ws-notice">
              下一步：给项目加入自己的资料，再把工作分配给同事或 Agent。未连接
              Agent 的工作由人类负责人交接。
            </p>
            <button
              className="ws-primary"
              disabled={!data.projects.length || !data.agents.length}
              onClick={async () => {
                await step("DONE");
                route("desk");
              }}
            >
              进入工作台
            </button>
          </Panel>
        )}
      </main>
    );
  const titles: Record<string, string> = {
    desk: "今天我应该关心什么？",
    projects: selectedProject ? str(selectedProject.name) : "我的项目",
    team: "真实团队",
    agents: "记名 Agent",
    resources: "项目资料",
    methods: "管理方法指南",
    settings: "工作空间设置",
  };
  function taskLink(task: Item) {
    return (
      <Link href={href("projects", task.project_id)}>{str(task.title)}</Link>
    );
  }
  function taskRows(tasks: Item[], empty: string) {
    return tasks.length ? (
      <ul className="ws-work-list">
        {tasks.map((t) => (
          <li key={str(t.id)}>
            <div>
              {taskLink(t)}
              <small>
                {executorName(t)} · 责任人 {userName(t.responsible_user_id)}
              </small>
            </div>
            <Status value={t.effective_status} />
          </li>
        ))}
      </ul>
    ) : (
      <p className="ws-muted">{empty}</p>
    );
  }
  function resourceLinks(resources: Item[]) {
    return (
      <ul className="ws-resource-list">
        {resources.map((r) => (
          <li key={str(r.id)} id={"resource-" + str(r.id)}>
            <div>
              {r.kind === "FILE" ? (
                <a
                  href={
                    "/api/v1/workspaces/" +
                    workspaceKey +
                    "/resources/" +
                    str(r.id) +
                    "/download"
                  }
                >
                  {str(r.name)} ↓
                </a>
              ) : (
                <a
                  href={str(r.source)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {str(r.name)} ↗
                </a>
              )}
              <small>
                {str(r.purpose)} ·{" "}
                {r.kind === "FILE"
                  ? `${str(r.filename)} · ${str(r.size)} 字节`
                  : str(r.source)}
              </small>
              {r.sha256 ? (
                <small className="ws-hash">SHA-256 {str(r.sha256)}</small>
              ) : null}
            </div>
            <span className="ws-muted">工作空间成员可访问</span>
          </li>
        ))}
      </ul>
    );
  }
  function resourceForms(project: Item) {
    return (
      <div className="ws-two">
        <details className="ws-details">
          <summary>上传自己的文件</summary>
          <ActionForm
            submit="保存文件"
            reset
            action={async (body, form) => {
              const fd = new FormData(form);
              fd.set("purpose", str(body.purpose));
              await save("projects/" + str(project.id) + "/files", fd);
            }}
          >
            <Field label="资料名称" name="name" />
            <Field label="资料用途" name="purpose" />
            <label className="ws-field">
              <span>文件（最大 25 MB）</span>
              <input type="file" name="file" required />
            </label>
          </ActionForm>
        </details>
        <details className="ws-details">
          <summary>加入链接 / 文档引用</summary>
          <ActionForm
            submit="保存资料链接"
            reset
            action={async (body) => {
              await save("projects/" + str(project.id) + "/resources", body);
            }}
          >
            <Field label="资料名称" name="name" />
            <label className="ws-field">
              <span>资料类型</span>
              <select aria-label="资料类型" name="kind">
                <option value="URL">网页链接</option>
                <option value="DOCUMENT">文档引用</option>
                <option value="GITHUB">GitHub / 外部资源</option>
              </select>
            </label>
            <Field label="来源链接" name="source" kind="url" />
            <Field label="资料用途" name="purpose" />
          </ActionForm>
        </details>
      </div>
    );
  }
  function historyRows(reports: Item[], prefix = "report") {
    return (
      <ol className="ws-history">
        {reports.map((r) => (
          <li key={str(r.id)} id={prefix + "-" + str(r.id)}>
            <div className="ws-section-head">
              <strong>
                {labels[str(r.report_type)] || str(r.report_type)}
                {r.decision_outcome ? (
                  <>
                    {" "}
                    · <Status value={r.decision_outcome} />
                  </>
                ) : null}
              </strong>
              <span className="ws-muted">
                {date(r.submitted_at)} ·{" "}
                {r.submitted_by_user_id
                  ? userName(r.submitted_by_user_id)
                  : agentName(r.submitted_by_id)}
              </span>
            </div>
            <p className="ws-pre">{str(r.summary)}</p>
            {r.result_summary ? (
              <p className="ws-pre">
                <strong>交付物：</strong>
                {str(r.result_summary)}
              </p>
            ) : null}
            {r.supplements_report_id ? (
              <p>
                <a href={"#" + prefix + "-" + str(r.supplements_report_id)}>
                  修订原成果 #{str(r.supplements_report_id)}
                </a>
              </p>
            ) : null}
            {r.reviewed_report_id ? (
              <p>
                <a href={"#" + prefix + "-" + str(r.reviewed_report_id)}>
                  验收成果 #{str(r.reviewed_report_id)}
                </a>
              </p>
            ) : null}
            {resourceLinks(
              data!.resources.filter((resource) =>
                list(r.evidence_resource_ids).includes(str(resource.id)),
              ),
            )}
          </li>
        ))}
      </ol>
    );
  }
  function eventRows(events: Item[]) {
    return (
      <ol className="ws-history">
        {events.map((event) => (
          <li key={str(event.id)} id={"event-" + str(event.id)}>
            <div className="ws-section-head">
              <strong>{labels[str(event.event_type)] || str(event.event_type)}</strong>
              <span className="ws-muted">
                {date(event.occurred_at)} ·{" "}
                {event.actor_user_id
                  ? userName(event.actor_user_id)
                  : event.actor_agent_id
                    ? agentName(event.actor_agent_id)
                    : "系统"}
              </span>
            </div>
            <p className="ws-pre">{str(event.summary)}</p>
          </li>
        ))}
      </ol>
    );
  }
  const waitingReview = data.tasks.filter(
    (t) =>
      t.effective_status === "WAITING_REVIEW" &&
      (eq(t.reviewer_user_id, data.me.id) ||
        data.projects.some(
          (p) => eq(p.id, t.project_id) && eq(p.owner_user_id, data.me.id),
        )),
  );
  const myWork = data.tasks.filter(
    (t) =>
      ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"].includes(
        str(t.effective_status),
      ) &&
      (eq(t.executor_user_id, data.me.id) ||
        eq(t.responsible_user_id, data.me.id)),
  );
  const pending = data.tasks.filter(
    (t) =>
      t.effective_status !== "COMPLETED" &&
      !myWork.includes(t) &&
      !waitingReview.includes(t),
  );
  const completed = data.tasks.filter(
    (t) => t.effective_status === "COMPLETED",
  );
  const readyProjects = data.projects.filter((project) => {
    const tasks = data.tasks.filter((task) => eq(task.project_id, project.id));
    return (
      eq(project.owner_user_id, data.me.id) &&
      project.status !== "COMPLETED" &&
      tasks.length > 0 &&
      tasks.every((task) => task.effective_status === "COMPLETED")
    );
  });
  const nextProjectId =
    waitingReview[0]?.project_id ||
    myWork[0]?.project_id ||
    readyProjects[0]?.id ||
    pending[0]?.project_id ||
    data.projects.find((project) => project.status !== "COMPLETED")?.id;
  const risks = data.projects.filter(
    (p) => p.blocker || p.status === "BLOCKED",
  );
  const riskTasks = data.tasks.filter(
    (t) =>
      t.effective_status !== "COMPLETED" &&
      t.due_at &&
      Date.parse(str(t.due_at)) < Date.now(),
  );
  const sidebar = {
    active: view,
    caption: str(data.workspace.name),
    primary: [
      { key: "desk", label: "工作台", icon: "☀", href: href("desk") },
      { key: "projects", label: "项目", icon: "◆", href: href("projects") },
      { key: "team", label: "团队", icon: "◇", href: href("team") },
      { key: "agents", label: "Agent", icon: "◉", href: href("agents") },
      { key: "resources", label: "资料", icon: "⬡", href: href("resources") },
    ],
    secondary: [
      {
        key: "methods",
        label: "方法指南",
        icon: "▣",
        href: href("methods"),
      },
      {
        key: "settings",
        label: "工作空间设置",
        icon: "⚙",
        href: href("settings"),
      },
    ],
  };
  return (
    <AppShell
      navigation={sidebar}
      eyebrow="松果智序 · 我的数据 / 私有"
      title={titles[view] || titles.desk}
      sidebarFoot={
        data.me.name + "\n" + (owner ? "工作空间负责人" : "团队成员")
      }
      tools={
        <div className="ws-top-tools">
          <label>
            <span className="ws-sr">切换工作空间</span>
            <select
              aria-label="切换工作空间"
              value={workspaceKey}
              onChange={(e) => route("desk", undefined, e.target.value)}
            >
              {session.workspaces.map((w) => (
                <option key={str(w.id)} value={str(w.workspace_key)}>
                  {str(w.name)}
                </option>
              ))}
            </select>
          </label>
          <button className="ws-secondary" onClick={() => void load()}>
            刷新
          </button>
          <button
            className="ws-secondary"
            onClick={async () => {
              await api("auth/logout", {});
              setData(null);
              setSession({ user: null, workspaces: [] });
              router.push("/workspace");
            }}
          >
            退出登录
          </button>
        </div>
      }
    >
      <div className="ws-content">
        {error && (
          <p className="ws-error" role="alert">
            {error}
          </p>
        )}
        {view === "desk" && (
          <>
            <Panel title="今日重点">
              <p>
                {waitingReview.length
                  ? `有 ${waitingReview.length} 项成果等待你的决定。`
                  : myWork.length
                    ? `你有 ${myWork.length} 项工作需要推进。`
                    : readyProjects.length
                      ? `有 ${readyProjects.length} 个项目的工作均已验收，等待你确认整个项目是否完成。`
                      : pending.length
                        ? `有 ${pending.length} 项工作等待其他人推进，请跟进交付或验收。`
                        : nextProjectId
                          ? "把自己的资料带进项目，再分配第一个工作项。"
                          : "当前工作已收尾，可以创建下一个项目。"}
              </p>
              <Link
                className="ws-primary ws-button"
                href={href("projects", nextProjectId)}
              >
                {waitingReview.length
                  ? "前往验收"
                  : readyProjects.length && !myWork.length
                    ? "确认项目成果与收尾"
                    : nextProjectId
                      ? "进入项目，推进下一步"
                      : "创建下一个项目"}
              </Link>
            </Panel>
            <div className="ws-two">
              <Panel title="等我决定">
                {taskRows(waitingReview, "目前没有成果等待你的验收。")}
              </Panel>
              <Panel title="我的工作">
                {taskRows(myWork, "目前没有分配给你的待办工作。")}
              </Panel>
              <Panel title="等待跟进">
                {taskRows(pending, "目前没有等待其他人推进的工作。")}
              </Panel>
              <Panel title="风险异常">
                {risks.map((p) => (
                  <p key={str(p.id)}>
                    <Link href={href("projects", p.id)}>{str(p.name)}</Link> ·{" "}
                    {str(p.blocker)}
                  </p>
                ))}
                {taskRows(
                  riskTasks,
                  risks.length ? "没有逾期工作。" : "目前没有阻碍或逾期工作。",
                )}
                {data.agents
                  .filter((a) => a.connection_status === "ERROR")
                  .map((a) => (
                    <p key={str(a.id)}>
                      {str(a.name)} · {str(a.connection_error)}
                    </p>
                  ))}
              </Panel>
            </div>
            <Panel title="最近完成">
              {taskRows(
                completed
                  .slice()
                  .sort(
                    (a, b) =>
                      Date.parse(str(b.completed_at)) -
                      Date.parse(str(a.completed_at)),
                  )
                  .slice(0, 5),
                "成果通过验收后，会保留在这里。",
              )}
              <p className="ws-muted">
                工作完成与成果接受会单独记录，项目由 Owner 明确确认完成。
              </p>
            </Panel>
          </>
        )}
        {view === "team" && (
          <>
            <Panel title="工作空间成员">
              <div className="ws-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>成员</th>
                      <th>邮箱</th>
                      <th>基础角色</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map((m) => (
                      <tr key={str(m.id)}>
                        <td>{str(m.display_name)}</td>
                        <td>{str(m.email)}</td>
                        <td>
                          {m.role === "OWNER" ? "工作空间负责人" : "成员"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="ws-muted">
                成员可访问此工作空间的项目与资料。执行、负责、验收在每个工作项中分别指定。
              </p>
            </Panel>
            {owner && (
              <Panel title="邀请同事">
                {inviteForm}
                <ul className="ws-work-list">
                  {data.invitations.map((i) => (
                    <li key={str(i.id)}>
                      <div>
                        {str(i.email)}
                        <small>有效期至 {date(i.expires_at)}</small>
                      </div>
                      <Status value={i.status} />
                      {i.status === "PENDING" && (
                        <button
                          className="ws-secondary"
                          onClick={() =>
                            void save(
                              "invitations/" + str(i.id) + "/revoke",
                              {},
                            )
                          }
                        >
                          撤销
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </>
        )}
        {view === "agents" && (
          <>
            {data.agents.map((agent) => (
              <Panel
                id={"agent-" + str(agent.id)}
                key={str(agent.id)}
                title={str(agent.name)}
                action={
                  <div className="ws-actions">
                    <span className="ws-status">已登记</span>
                    <Status value={agent.connection_status} />
                  </div>
                }
              >
                <dl className="ws-facts">
                  <dt>人类负责人</dt>
                  <dd>{userName(agent.responsible_user_id)}</dd>
                  <dt>职责与能力</dt>
                  <dd className="ws-pre">{str(agent.responsibilities)}</dd>
                  <dt>所需输入</dt>
                  <dd className="ws-pre">{str(agent.standard_inputs)}</dd>
                  <dt>预期产出</dt>
                  <dd className="ws-pre">{str(agent.standard_outputs)}</dd>
                  <dt>最近连接</dt>
                  <dd>
                    {agent.last_connected_at
                      ? date(agent.last_connected_at)
                      : "尚未建立实际连接"}
                  </dd>
                  <dt>登记 ID</dt>
                  <dd>{str(agent.id)}</dd>
                </dl>
                {agent.connection_error ? (
                  <p className="ws-error">{str(agent.connection_error)}</p>
                ) : null}
                {(owner || eq(agent.responsible_user_id, data.me.id)) && (
                  <details className="ws-details">
                    <summary>连接已有 Agent</summary>
                    <p>
                      把连接信息交给你现有 Agent
                      的使用者。需要它实际确认连接后，状态才会变为「可用」。
                    </p>
                    <button
                      className="ws-secondary"
                      onClick={async () =>
                        setConnection({
                          ...(await save(
                            "agents/" + str(agent.id) + "/connect",
                            {},
                          )),
                          agent_id: agent.id,
                        })
                      }
                    >
                      生成连接信息
                    </button>
                    <button
                      className="ws-secondary"
                      onClick={async () => {
                        await save("agents/" + str(agent.id) + "/revoke", {});
                        setConnection(null);
                      }}
                    >
                      撤销连接
                    </button>
                    {connection && eq(connection.agent_id, agent.id) && (
                      <div className="ws-notice">
                        <p>
                          连接密钥仅显示这一次，请交给负责运行此 Agent 的人。
                        </p>
                        <label className="ws-field">
                          <span>连接密钥</span>
                          <input readOnly value={str(connection.token)} />
                        </label>
                        <label className="ws-field">
                          <span>连接地址</span>
                          <input readOnly value={str(connection.endpoint)} />
                        </label>
                        <p>有效期至 {date(connection.expires_at)}</p>
                        <a
                          href="/workspace/agent-connection"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          查看连接说明
                        </a>
                      </div>
                    )}
                  </details>
                )}
                {(owner || eq(agent.responsible_user_id, data.me.id)) && (
                  <details className="ws-details">
                    <summary>修改角色职责</summary>
                    <ActionForm
                      submit="保存角色职责"
                      action={async (body) => {
                        await save(
                          "agents/" + str(agent.id) + "/profile",
                          body,
                        );
                      }}
                    >
                      <Field
                        label="Agent 名称"
                        name="name"
                        value={str(agent.name)}
                      />
                      <MemberSelect
                        data={data}
                        label="人类负责人"
                        name="responsible_user_id"
                        value={str(agent.responsible_user_id)}
                      />
                      <Field
                        label="职责与能力"
                        name="responsibilities"
                        kind="textarea"
                        value={str(agent.responsibilities)}
                      />
                      <Field
                        label="需要的输入"
                        name="standard_inputs"
                        kind="textarea"
                        value={str(agent.standard_inputs)}
                      />
                      <Field
                        label="会产出什么"
                        name="standard_outputs"
                        kind="textarea"
                        value={str(agent.standard_outputs)}
                      />
                    </ActionForm>
                  </details>
                )}
                <h3>工作履历</h3>
                {taskRows(
                  data.tasks.filter((t) => eq(t.holder_agent_id, agent.id)),
                  "尚未承担项目工作。",
                )}
                {data.tasks
                  .filter((t) => eq(t.holder_agent_id, agent.id))
                  .map((t) => (
                    <details key={str(t.id)} className="ws-details">
                      <summary>
                        {str(t.title)} · 验收人 {userName(t.reviewer_user_id)}
                      </summary>
                      {historyRows(
                        data.reports.filter((r) => eq(r.task_id, t.id)),
                      )}
                    </details>
                  ))}
              </Panel>
            ))}
            {owner && <Panel title="登记新的记名 Agent">{agentForm}</Panel>}
          </>
        )}
        {view === "projects" && !selectedProject && (
          <>
            <Panel title="自己的项目">
              {data.projects.length ? (
                <ul className="ws-work-list">
                  {data.projects.map((p) => (
                    <li key={str(p.id)}>
                      <div>
                        <Link href={href("projects", p.id)}>{str(p.name)}</Link>
                        <small>
                          {str(p.goal)} · Owner {userName(p.owner_user_id)} ·
                          当前阶段 {str(p.phase)} · 阶段状态 {labels[str(p.phase_status)]}
                        </small>
                      </div>
                      <Status value={p.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p>创建第一个项目，明确目标和验收标准。</p>
              )}
            </Panel>
            <details className="ws-details" open={!data.projects.length}>
              <summary>创建自己的项目</summary>
              {projectForm}
            </details>
          </>
        )}
        {view === "projects" &&
          selectedProject &&
          (() => {
            const project = selectedProject,
              projectTasks = data.tasks.filter((t) =>
                eq(t.project_id, project.id),
              ),
              resources = data.resources.filter((r) =>
                eq(r.project_id, project.id),
              ),
              isOwner = eq(project.owner_user_id, data.me.id),
              closed = project.status === "COMPLETED";
            const users = data.user_members.filter((m) =>
                eq(m.project_id, project.id),
              ),
              agents = data.agent_members.filter((m) =>
                eq(m.project_id, project.id),
              );
            return (
              <>
                <Link href={href("projects")}>← 全部项目</Link>
                <p className="ws-method-project-link"><Link href={href("methods", project.id)}>选择管理方法，辅助分析当前项目 →</Link></p>
                <WorkspaceWorkline
                  project={project}
                  tasks={projectTasks}
                  reports={data.reports}
                  ownerName={userName(project.owner_user_id)}
                />
                <Panel
                  id="workspace-project-facts"
                  title="目标与进展"
                  action={<Status value={project.status} />}
                >
                  <dl className="ws-facts">
                    <dt>要完成什么</dt>
                    <dd className="ws-pre">{str(project.goal)}</dd>
                    <dt>验收标准</dt>
                    <dd className="ws-pre">
                      {str(project.acceptance_criteria)}
                    </dd>
                    <dt>项目 Owner</dt>
                    <dd>{userName(project.owner_user_id)}</dd>
                    <dt>当前阶段</dt>
                    <dd>
                      {str(project.phase)} · <Status value={project.phase_status} />
                    </dd>
                    <dt>现在到哪里</dt>
                    <dd>{str(project.current_summary)}</dd>
                    <dt>下一步</dt>
                    <dd>{str(project.next_action) || "由 Owner 确认下一步"}</dd>
                    <dt>卡在哪里</dt>
                    <dd>{str(project.blocker) || "暂无已登记的阻碍"}</dd>
                    <dt>参与成员</dt>
                    <dd>{users.map((m) => userName(m.user_id)).join("、")}</dd>
                    <dt>参与 Agent</dt>
                    <dd>
                      {agents.map((m) => agentName(m.agent_id)).join("、") ||
                        "尚未加入"}
                    </dd>
                  </dl>
                  <p className="ws-notice">
                    接受一个成果只完成对应工作。阶段与整个项目由 Owner
                    单独确认。
                  </p>
                  {isOwner && (
                    <details className="ws-details">
                      <summary>更新阶段 / 项目进展</summary>
                      <ActionForm
                        submit="记录项目进展"
                        action={async (body) => {
                          await save(
                            "projects/" + str(project.id) + "/state",
                            body,
                          );
                        }}
                      >
                        <Field
                          label="项目名称"
                          name="name"
                          value={str(project.name)}
                        />
                        <Field
                          label="项目目标"
                          name="goal"
                          kind="textarea"
                          value={str(project.goal)}
                        />
                        <Field
                          label="验收标准"
                          name="acceptance_criteria"
                          kind="textarea"
                          value={str(project.acceptance_criteria)}
                        />
                        <Field
                          label="当前阶段"
                          name="phase"
                          value={str(project.phase)}
                        />
                        <label className="ws-field">
                          <span>阶段状态（独立于项目状态）</span>
                          <select
                            aria-label="阶段状态"
                            name="phase_status"
                            defaultValue={str(project.phase_status) || "ACTIVE"}
                          >
                            <option value="ACTIVE">阶段进行中</option>
                            <option value="COMPLETED">阶段已完成</option>
                          </select>
                        </label>
                        <Field
                          label="项目进展 / 最终成果"
                          name="current_summary"
                          kind="textarea"
                          value={str(project.current_summary)}
                        />
                        <Field
                          label="下一步"
                          name="next_action"
                          value={str(project.next_action)}
                          required={false}
                        />
                        <Field
                          label="阻碍"
                          name="blocker"
                          value={str(project.blocker)}
                          required={false}
                        />
                        <label className="ws-field">
                          <span>整个项目状态</span>
                          <select
                            aria-label="整个项目状态"
                            name="status"
                            defaultValue={str(project.status)}
                          >
                            <option value="ACTIVE">进行中</option>
                            <option value="WAITING">等待跟进</option>
                            <option value="BLOCKED">有阻碍</option>
                            <option value="COMPLETED">确认整个项目完成</option>
                          </select>
                        </label>
                      </ActionForm>
                    </details>
                  )}
                </Panel>
                <Panel
                  title="项目资料"
                  action={<span className="ws-muted">工作空间成员可访问</span>}
                >
                  {resources.length ? (
                    resourceLinks(resources)
                  ) : (
                    <p>加入自己的资料，让团队与 Agent 有依据地工作。</p>
                  )}
                  {!closed && resourceForms(project)}
                </Panel>
                {isOwner && !closed && (
                  <details className="ws-details">
                    <summary>加入项目参与人或 Agent</summary>
                    <ActionForm
                      submit="加入项目"
                      reset
                      action={async (body) => {
                        const [type, value] = str(body.participant).split(":");
                        await save(
                          "projects/" + str(project.id) + "/participants",
                          { [type === "user" ? "user_id" : "agent_id"]: value },
                        );
                      }}
                    >
                      <label className="ws-field">
                        <span>参与人 / Agent</span>
                        <select
                          aria-label="参与人 / Agent"
                          name="participant"
                          required
                        >
                          {data.members.map((m) => (
                            <option
                              key={"u" + str(m.id)}
                              value={"user:" + str(m.user_id)}
                            >
                              {str(m.display_name)} · 人
                            </option>
                          ))}
                          {data.agents.map((a) => (
                            <option
                              key={"a" + str(a.id)}
                              value={"agent:" + str(a.id)}
                            >
                              {str(a.name)} · Agent ·{" "}
                              {labels[str(a.connection_status)]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </ActionForm>
                  </details>
                )}
                <Panel id="workspace-work-items" title="工作与交接">
                  {!projectTasks.length && (
                    <p className="ws-muted">
                      尚未建立工作。先加入执行成员或
                      Agent，然后明确执行人、责任人和验收人。
                    </p>
                  )}
                  {projectTasks.map((task) => {
                    const versions = data.reports.filter((r) =>
                        eq(r.task_id, task.id),
                      ),
                      canSubmit =
                        eq(task.executor_user_id, data.me.id) ||
                        eq(task.responsible_user_id, data.me.id),
                      canReview =
                        isOwner || eq(task.reviewer_user_id, data.me.id),
                      latest = versions.find((r) =>
                        eq(r.id, task.latest_report_id),
                      );
                    return (
                      <article
                        key={str(task.id)}
                        className="ws-task"
                        id={"task-" + str(task.id)}
                      >
                        <div className="ws-section-head">
                          <h3>{str(task.title)}</h3>
                          <Status value={task.effective_status} />
                        </div>
                        <p className="ws-pre">{str(task.summary)}</p>
                        <p className="ws-muted">
                          执行：{executorName(task)} · 人类责任人：
                          {userName(task.responsible_user_id)} · 验收：
                          {userName(task.reviewer_user_id)} · 截止：
                          {task.due_at ? date(task.due_at) : "未设置"}
                        </p>
                        {Boolean(task.holder_agent_id) &&
                          data.agents.find((a) =>
                            eq(a.id, task.holder_agent_id),
                          )?.connection_status === "NOT_CONNECTED" && (
                            <p className="ws-notice">
                              此 Agent
                              未连接，工作尚未自动执行。请由人类责任人交接并代为提交实际成果。
                            </p>
                          )}
                        {canSubmit &&
                          !closed &&
                          task.effective_status === "OPEN" && (
                            <ActionForm
                              submit="开始工作"
                              action={async () => {
                                await save(
                                  "tasks/" + str(task.id) + "/start",
                                  {},
                                );
                              }}
                            >
                              <span className="ws-muted">
                                确认已实际开始此工作。
                              </span>
                            </ActionForm>
                          )}
                        <details className="ws-details">
                          <summary>参考资料</summary>
                          {resourceLinks(
                            resources.filter((r) =>
                              list(task.input_resource_ids).includes(str(r.id)),
                            ),
                          )}
                        </details>
                        {versions.length > 0 && (
                          <details
                            className="ws-details"
                            open={
                              task.effective_status === "WAITING_REVIEW" ||
                              task.effective_status === "NEEDS_REVISION"
                            }
                          >
                            <summary>
                              成果、证据与验收历史（{versions.length} 条）
                            </summary>
                            {historyRows(versions, "task-report")}
                          </details>
                        )}
                        {canSubmit &&
                          !closed &&
                          ["OPEN", "IN_PROGRESS", "NEEDS_REVISION"].includes(
                            str(task.effective_status),
                          ) && (
                            <details
                              className="ws-details"
                              open={task.effective_status === "NEEDS_REVISION"}
                            >
                              <summary>
                                {task.effective_status === "NEEDS_REVISION"
                                  ? "追加修订，重新提交验收"
                                  : "提交真实成果与证据"}
                              </summary>
                              <ActionForm
                                key={str(task.latest_report_id)}
                                submit={
                                  task.effective_status === "NEEDS_REVISION"
                                    ? "提交修订"
                                    : "提交成果"
                                }
                                action={async (body) => {
                                  await save(
                                    "tasks/" + str(task.id) + "/results",
                                    {
                                      ...body,
                                      supplements_report_id:
                                        task.effective_status ===
                                        "NEEDS_REVISION"
                                          ? task.latest_report_id
                                          : undefined,
                                    },
                                  );
                                }}
                              >
                                <Field
                                  label="成果说明 / 修订说明"
                                  name="summary"
                                  kind="textarea"
                                />
                                <Field
                                  label="交付物说明"
                                  name="result_summary"
                                  kind="textarea"
                                />
                                <ResourceChecks
                                  resources={resources}
                                  name="evidence_resource_ids"
                                />
                                <p className="ws-muted">
                                  新文件或证据先保存到上方「项目资料」，再关联到本次成果。
                                </p>
                              </ActionForm>
                            </details>
                          )}
                        {canReview &&
                          latest &&
                          task.effective_status === "WAITING_REVIEW" && (
                            <ActionForm
                              submit="保存验收决定"
                              action={async (body) => {
                                await save(
                                  "reports/" + str(latest.id) + "/review",
                                  body,
                                );
                              }}
                            >
                              <label className="ws-field">
                                <span>验收决定</span>
                                <select aria-label="验收决定" name="outcome">
                                  <option value="RETURN">退回修订</option>
                                  <option value="ACCEPT">接受此成果</option>
                                </select>
                              </label>
                              <Field
                                label="验收说明 / 退回理由"
                                name="reason"
                                kind="textarea"
                              />
                              <p className="ws-muted">
                                当前决定只针对本次成果，不会把整个项目标为完成。
                              </p>
                            </ActionForm>
                          )}
                      </article>
                    );
                  })}
                </Panel>
                {isOwner && !closed && (
                  <details className="ws-details">
                    <summary>建立并分配工作</summary>
                    <ActionForm
                      submit="创建工作项"
                      reset
                      action={async (body) => {
                        const [type, value] = str(body.executor).split(":");
                        await save("projects/" + str(project.id) + "/tasks", {
                          ...body,
                          [type === "user"
                            ? "executor_user_id"
                            : "holder_agent_id"]: value,
                        });
                      }}
                    >
                      <Field label="工作名称" name="title" />
                      <Field label="工作内容" name="summary" kind="textarea" />
                      <label className="ws-field">
                        <span>谁执行</span>
                        <select aria-label="谁执行" name="executor" required>
                          <option value="">请选择已加入项目的执行主体</option>
                          {users.map((m) => (
                            <option
                              key={str(m.id)}
                              value={"user:" + str(m.user_id)}
                            >
                              {userName(m.user_id)} · 人
                            </option>
                          ))}
                          {agents.map((m) => (
                            <option
                              key={str(m.id)}
                              value={"agent:" + str(m.agent_id)}
                            >
                              {agentName(m.agent_id)} · Agent
                            </option>
                          ))}
                        </select>
                      </label>
                      <MemberSelect
                        data={data}
                        label="谁负责（人类）"
                        name="responsible_user_id"
                      />
                      <MemberSelect
                        data={data}
                        label="谁验收"
                        name="reviewer_user_id"
                      />
                      <Field
                        label="截止时间"
                        name="due_at"
                        kind="datetime-local"
                        required={false}
                      />
                      <ResourceChecks
                        resources={resources}
                        name="input_resource_ids"
                      />
                    </ActionForm>
                  </details>
                )}
                <Panel id="workspace-history" title="项目成果与完整历史">
                  {data.reports.some((r) => eq(r.project_id, project.id))
                    ? historyRows(
                        data.reports.filter((r) => eq(r.project_id, project.id)),
                      )
                    : (
                    <p className="ws-muted">
                      真实报告、证据、退回原因、修订与决定会持续保存在这里。
                    </p>
                  )}
                  <h3>执行与成员事件</h3>
                  {data.events.some(
                    (event) => !event.project_id || eq(event.project_id, project.id),
                  ) ? (
                    eventRows(
                      data.events.filter(
                        (event) =>
                          !event.project_id || eq(event.project_id, project.id),
                      ),
                    )
                  ) : (
                    <p className="ws-muted">
                      工作开始、Agent 连接与邀请状态变化会以追加事件保存在这里。
                    </p>
                  )}
                </Panel>
              </>
            );
          })()}
        {view === "methods" && (
          <Panel title="管理方法指南">
            <WorkspaceMethodsGuide
              returnHref={selectedProject ? href("projects", selectedProject.id) : href("projects")}
              returnLabel={selectedProject ? "返回当前项目" : "返回项目列表"}
            />
          </Panel>
        )}
        {view === "resources" && (
          <Panel title="我的资料，按项目保存">
            {data.projects.map((p) => (
              <section key={str(p.id)}>
                <h3>
                  <Link href={href("projects", p.id)}>{str(p.name)}</Link>
                </h3>
                {resourceLinks(
                  data.resources.filter((r) => eq(r.project_id, p.id)),
                )}
                {!data.resources.some((r) => eq(r.project_id, p.id)) && (
                  <p className="ws-muted">暂无资料。进入项目加入文件或链接。</p>
                )}
              </section>
            ))}
          </Panel>
        )}
        {view === "settings" && (
          <Panel title="工作空间设置">
            <dl className="ws-facts">
              <dt>工作空间</dt>
              <dd>{str(data.workspace.name)}</dd>
              <dt>团队简介</dt>
              <dd>{str(data.workspace.description) || "未填写"}</dd>
              <dt>默认可见范围</dt>
              <dd>私有，仅此工作空间的成员</dd>
              <dt>你的角色</dt>
              <dd>{owner ? "工作空间负责人" : "成员"}</dd>
            </dl>
            {owner && (
              <Link className="ws-secondary ws-button" href={href("setup")}>
                重新打开首次向导
              </Link>
            )}
            <Link
              className="ws-secondary ws-button"
              href={href("new-workspace")}
            >
              创建另一个工作空间
            </Link>
            <a
              href="https://songguo-zhixu-demo.psuso1985.chatgpt.site"
              target="_blank"
              rel="noopener noreferrer"
              className="ws-link"
            >
              体验独立示例（演示数据）
            </a>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
