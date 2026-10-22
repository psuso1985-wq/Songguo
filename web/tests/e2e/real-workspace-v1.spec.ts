import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
const password = randomUUID() + "!aA7";
async function register(page: Page, name: string, email: string) {
  await page.getByLabel("你的姓名", { exact: true }).fill(name);
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册并开始", exact: true }).click();
}
test("clean accounts complete their own human + named Agent project with durable review history", async ({
  browser,
}, testInfo) => {
  const run = randomUUID(),
    emailA = `browser-a-${run}@example.invalid`,
    emailB = `browser-b-${run}@example.invalid`;
  const ctxA = await browser.newContext(),
    ctxB = await browser.newContext();
  const a = await ctxA.newPage(),
    b = await ctxB.newPage();
  const pageErrors: string[] = [];
  a.on("pageerror", (e) => pageErrors.push(e.message));
  b.on("pageerror", (e) => pageErrors.push(e.message));
  await a.goto("/workspace");
  await register(a, "Owner A", emailA);
  await expect(
    a.getByRole("heading", { name: "先给你的工作一个家" }),
  ).toBeVisible();
  await a
    .getByLabel("工作空间名称", { exact: true })
    .fill("竞品研究团队 " + run.slice(0, 8));
  await a
    .getByLabel("团队 / 个人简介（选填）", { exact: true })
    .fill("两个人与一位研究 Agent，用真实资料完成研究交付。");
  await a.getByRole("button", { name: "创建工作空间", exact: true }).click();
  await a.getByLabel("同事邮箱", { exact: true }).fill(emailB);
  await a.getByRole("button", { name: "生成邀请链接", exact: true }).click();
  const inviteLink = await a
    .getByLabel("邀请链接（仅显示这一次）", { exact: true })
    .inputValue();
  await a.getByRole("button", { name: "继续创建项目", exact: true }).click();
  await a.getByLabel("项目名称", { exact: true }).fill("协作产品竞品研究");
  await a
    .getByLabel("项目目标", { exact: true })
    .fill("比较资料组织与工作交接能力，帮助小团队选择工具。");
  await a
    .getByLabel("验收标准", { exact: true })
    .fill("提供官网来源、比较结果、适用限制与查阅日期。");
  await a.getByRole("button", { name: "创建项目", exact: true }).click();
  await a.getByLabel("Agent 名称", { exact: true }).fill("研究助理 C");
  await a
    .getByLabel("职责与能力", { exact: true })
    .fill("收集官网资料，整理比较表与可核查证据。");
  await a
    .getByLabel("需要的输入", { exact: true })
    .fill("研究目标、官网资源与团队简报。");
  await a
    .getByLabel("会产出什么", { exact: true })
    .fill("研究摘要、比较表、来源与使用限制。");
  await a.getByRole("button", { name: "登记 Agent", exact: true }).click();
  await a.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "今天我应该关心什么？" }),
  ).toBeVisible();
  await b.goto(inviteLink);
  await register(b, "成员 B", emailB);
  await b.getByRole("button", { name: "接受邀请", exact: true }).click();
  await expect(
    b.getByRole("heading", { name: "今天我应该关心什么？" }),
  ).toBeVisible();
  await a.getByRole("link", { name: "Agent", exact: true }).click();
  await expect(a.getByText("未连接", { exact: true }).first()).toBeVisible();
  await a.getByRole("link", { name: "工作台", exact: true }).click();
  await a
    .getByRole("link", { name: "进入项目，推进下一步", exact: true })
    .click();
  await expect(a).toHaveURL(/view=projects&project=\d+/);
  const projectURL = a.url();
  const workline = a.getByRole("region", { name: "项目工作板" });
  await expect(workline).toBeVisible();
  await expect(workline).toContainText("当前阶段");
  await expect(workline).toContainText("尚未创建工作项");
  await expect(workline).toContainText("不生成虚构甘特图");
  const participant = a.locator("details").filter({
    has: a
      .locator("summary")
      .getByText("加入项目参与人或 Agent", { exact: true }),
  });
  await participant.locator("summary").click();
  await participant
    .getByLabel("参与人 / Agent", { exact: true })
    .selectOption({ label: "成员 B · 人" });
  await participant
    .getByRole("button", { name: "加入项目", exact: true })
    .click();
  await expect(participant.getByRole("status")).toHaveText("已保存");
  await participant
    .getByLabel("参与人 / Agent", { exact: true })
    .selectOption({ label: "研究助理 C · Agent · 未连接" });
  await participant
    .getByRole("button", { name: "加入项目", exact: true })
    .click();
  await expect(participant.getByRole("status")).toHaveText("已保存");
  const upload = a.locator("details").filter({
    has: a.locator("summary").getByText("上传自己的文件", { exact: true }),
  });
  await upload.locator("summary").click();
  await upload.getByLabel("资料名称", { exact: true }).fill("团队研究简报");
  await upload
    .getByLabel("资料用途", { exact: true })
    .fill("作为工作输入与范围说明");
  await upload.getByLabel("文件（最大 25 MB）", { exact: true }).setInputFiles({
    name: "团队研究简报.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(
      "# 团队研究简报\n比较 Asana、Trello、Notion 的资料组织与工作交接。\n验收需要官网来源、比较说明与限制。",
    ),
  });
  await upload.getByRole("button", { name: "保存文件", exact: true }).click();
  await expect(upload.getByRole("status")).toHaveText("已保存");
  const link = a.locator("details").filter({
    has: a.locator("summary").getByText("加入链接 / 文档引用", { exact: true }),
  });
  await link.locator("summary").click();
  await link.getByLabel("资料名称", { exact: true }).fill("Asana 官网");
  await link
    .getByLabel("来源链接", { exact: true })
    .fill("https://asana.com/features");
  await link
    .getByLabel("资料用途", { exact: true })
    .fill("核查任务分配与审批功能");
  await link.getByRole("button", { name: "保存资料链接", exact: true }).click();
  await expect(link.getByRole("status")).toHaveText("已保存");
  const taskForm = a.locator("details").filter({
    has: a.locator("summary").getByText("建立并分配工作", { exact: true }),
  });
  await taskForm.locator("summary").click();
  await taskForm.getByLabel("工作名称", { exact: true }).fill("研究协作工具");
  await taskForm
    .getByLabel("工作内容", { exact: true })
    .fill("用简报与官网资料产出功能比较说明。");
  await taskForm
    .getByLabel("谁执行", { exact: true })
    .selectOption({ label: "成员 B · 人" });
  const snapshot = await (
    await ctxA.request.get(
      "/api/v1/workspaces/" + new URL(projectURL).searchParams.get("workspace"),
    )
  ).json();
  const memberB = snapshot.members.find(
    (m: { display_name: string }) => m.display_name === "成员 B",
  );
  await taskForm
    .getByLabel("谁负责（人类）", { exact: true })
    .selectOption(String(memberB.user_id));
  await taskForm
    .getByRole("checkbox", { name: "团队研究简报", exact: true })
    .check();
  await taskForm
    .getByRole("button", { name: "创建工作项", exact: true })
    .click();
  await expect(taskForm.getByRole("status")).toHaveText("已保存");
  await b.goto(projectURL);
  const taskB = b.locator("article.ws-task").filter({
    has: b.getByRole("heading", { name: "研究协作工具", exact: true }),
  });
  await taskB.getByText("提交真实成果与证据", { exact: true }).click();
  await taskB
    .getByLabel("成果说明 / 修订说明", { exact: true })
    .fill(
      "Asana 支持任务协作与审批，Trello 通过看板组织工作，Notion 用文档和数据库组织资料。",
    );
  await taskB
    .getByLabel("交付物说明", { exact: true })
    .fill("第一版比较说明，尚未填写来源日期。");
  await taskB
    .getByRole("checkbox", { name: "Asana 官网", exact: true })
    .check();
  await taskB.getByRole("button", { name: "提交成果", exact: true }).click();
  await expect(taskB.getByText("等待验收", { exact: true })).toBeVisible();
  await a.reload();
  await expect(workline).toContainText("1 项成果等待指定验收人");
  const taskA = a.locator("article.ws-task").filter({
    has: a.getByRole("heading", { name: "研究协作工具", exact: true }),
  });
  await taskA
    .getByLabel("验收说明 / 退回理由", { exact: true })
    .fill("补充来源查阅日期和不同订阅方案的限制。");
  await taskA
    .getByRole("button", { name: "保存验收决定", exact: true })
    .click();
  await expect(taskA.getByText("待修订", { exact: true })).toBeVisible();
  await expect(workline).toContainText("1 项成果已退回");
  await b.reload();
  await taskB
    .getByLabel("成果说明 / 修订说明", { exact: true })
    .fill("已追加查阅日期与限制：官网仅说明功能，具体方案权限需单独核查。");
  await taskB
    .getByLabel("交付物说明", { exact: true })
    .fill("修订后的比较说明与官网证据。");
  await taskB
    .getByRole("checkbox", { name: "Asana 官网", exact: true })
    .check();
  await taskB.getByRole("button", { name: "提交修订", exact: true }).click();
  await expect(taskB.getByText("等待验收", { exact: true })).toBeVisible();
  await a.reload();
  await taskA.getByLabel("验收决定", { exact: true }).selectOption("ACCEPT");
  await taskA
    .getByLabel("验收说明 / 退回理由", { exact: true })
    .fill("来源、日期和适用限制已齐全，接受此成果。");
  await taskA
    .getByRole("button", { name: "保存验收决定", exact: true })
    .click();
  await expect(taskA.getByText("已完成", { exact: true })).toBeVisible();
  await expect(workline).toContainText("所有工作成果已接受，仍需项目负责人单独确认项目完成");
  await expect(workline.locator(".ws-workline-metrics")).toContainText("1 / 1");
  await expect(
    a
      .getByRole("heading", { name: "目标与进展", exact: true })
      .locator("..")
      .getByText("进行中", { exact: true }),
  ).toBeVisible();
  await a.getByRole("link", { name: "工作台", exact: true }).click();
  await expect(
    a.getByRole("link", { name: "确认项目成果与收尾", exact: true }),
  ).toBeVisible();
  await a.getByRole("button", { name: "退出登录", exact: true }).click();
  await a.getByRole("button", { name: "已有账号？登录", exact: true }).click();
  await a.getByLabel("邮箱", { exact: true }).fill(emailA);
  await a.getByLabel("密码", { exact: true }).fill(password);
  await a.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    a.getByRole("heading", { name: "今天我应该关心什么？" }),
  ).toBeVisible();
  await a.goto(projectURL);
  await expect(workline).toContainText("所有工作成果已接受，仍需项目负责人单独确认项目完成");
  await expect(
    a
      .getByText("补充来源查阅日期和不同订阅方案的限制。", { exact: true })
      .first(),
  ).toBeAttached();
  await expect(
    a
      .getByText(
        "已追加查阅日期与限制：官网仅说明功能，具体方案权限需单独核查。",
        { exact: true },
      )
      .first(),
  ).toBeAttached();
  await expect(
    a
      .getByText("来源、日期和适用限制已齐全，接受此成果。", { exact: true })
      .first(),
  ).toBeAttached();
  await a.screenshot({
    path: testInfo.outputPath("project-history-desktop.png"),
    fullPage: true,
  });
  await a.setViewportSize({ width: 390, height: 844 });
  await a.screenshot({
    path: testInfo.outputPath("project-history-mobile.png"),
    fullPage: true,
  });
  expect(
    await a.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await a.setViewportSize({ width: 1280, height: 900 });
  await a.evaluate(() =>
    document.documentElement.setAttribute("data-theme", "dark"),
  );
  await a.screenshot({
    path: testInfo.outputPath("project-history-dark.png"),
    fullPage: true,
  });
  // Accepting the work left the project ACTIVE above. Only this explicit
  // Owner action may close it, and the result must survive a reload.
  const closeout = a.locator("details").filter({
    has: a.locator("summary").getByText("更新阶段 / 项目进展", { exact: true }),
  });
  await closeout.locator("summary").click();
  await closeout.getByLabel("当前阶段", { exact: true }).fill("交付验收");
  await closeout.getByLabel("阶段状态", { exact: true }).selectOption("COMPLETED");
  await closeout
    .getByLabel("项目进展 / 最终成果", { exact: true })
    .fill("全部工作成果已验收，由项目负责人明确确认结案。");
  await closeout.getByLabel("整个项目状态", { exact: true }).selectOption("COMPLETED");
  await closeout.getByRole("button", { name: "记录项目进展", exact: true }).click();
  await expect(workline).toContainText("整个项目已经过负责人明确确认完成");
  await a.reload();
  await expect(workline).toContainText("整个项目已经过负责人明确确认完成");
  await expect(a.getByRole("heading", { name: "目标与进展", exact: true })
    .locator("..").getByText("已完成", { exact: true }).first()).toBeVisible();
  await a.screenshot({
    path: testInfo.outputPath("project-manual-closeout.png"),
    fullPage: true,
  });

  // A third account owns a genuinely independent workspace, rather than
  // reusing the invited member's authorized session to simulate isolation.
  const ctxC = await browser.newContext();
  try {
    const c = await ctxC.newPage();
    c.on("pageerror", (e) => pageErrors.push(e.message));
    await c.goto("/workspace");
    await register(c, "独立空间负责人 C", `browser-c-${run}@example.invalid`);
    await c.getByLabel("工作空间名称", { exact: true })
      .fill("独立隔离空间 " + run.slice(0, 8));
    await c.getByRole("button", { name: "创建工作空间", exact: true }).click();
    await expect(c.getByRole("button", { name: "稍后邀请，继续创建项目", exact: true })).toBeVisible();
    const workspaceKey = new URL(projectURL).searchParams.get("workspace")!;
    const denied = await ctxC.request.get("/api/v1/workspaces/" + workspaceKey);
    // Deliberately conceal whether a foreign workspace exists.
    expect(denied.status()).toBe(404);
    await c.goto(projectURL);
    await expect(c.getByRole("alert").filter({ hasText: /^找不到此工作空间或你没有访问权限。$/ })).toHaveText("找不到此工作空间或你没有访问权限。");
    await expect(c.getByRole("region", { name: "项目工作板" })).toHaveCount(0);
    await expect(c.getByText("协作产品竞品研究", { exact: true })).toHaveCount(0);
    await expect(c.getByText("团队研究简报", { exact: true })).toHaveCount(0);
    await c.screenshot({
      path: testInfo.outputPath("independent-workspace-denied.png"),
      fullPage: true,
    });
  } finally {
    await ctxC.close();
  }
  expect(pageErrors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});
