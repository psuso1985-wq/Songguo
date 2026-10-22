import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

test("public-mode methods guide stays inside the authenticated workspace", async ({ page }, testInfo) => {
  const run = randomUUID();
  const password = randomUUID() + "!aA7";
  await page.goto("/methods");
  await expect(page.getByText("个人试用版 · 仅限个人非商业试用，不授予商用许可。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/workspace(?:\?|$)/);

  await page.getByLabel("你的姓名", { exact: true }).fill("方法测试负责人");
  await page.getByLabel("邮箱", { exact: true }).fill("methods-" + run + "@example.invalid");
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "注册并开始", exact: true }).click();

  await page.getByLabel("工作空间名称", { exact: true }).fill("方法测试空间 " + run.slice(0, 8));
  await page.getByRole("button", { name: "创建工作空间", exact: true }).click();
  await page.getByRole("button", { name: "稍后邀请，继续创建项目", exact: true }).click();

  await page.getByLabel("项目名称", { exact: true }).fill("方法测试项目");
  await page.getByLabel("项目目标", { exact: true }).fill("用真实资料完成方案分析");
  await page.getByLabel("验收标准", { exact: true }).fill("有事实来源和人工验收结果");
  await page.getByRole("button", { name: "创建项目", exact: true }).click();

  await page.getByLabel("Agent 名称", { exact: true }).fill("方法研究助理");
  await page.getByLabel("职责与能力", { exact: true }).fill("记录方法分析结果，不自动作出决定");
  await page.getByLabel("需要的输入", { exact: true }).fill("真实项目目标与资料");
  await page.getByLabel("会产出什么", { exact: true }).fill("附证据的分析结果");
  await page.getByRole("button", { name: "登记 Agent", exact: true }).click();
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();

  await page.getByRole("link", { name: "方法指南", exact: true }).click();
  await expect(page).toHaveURL(/view=methods/);
  await expect(page.getByRole("heading", { name: "管理方法指南", exact: true }).first()).toBeVisible();
  await expect(page.locator("article.ws-method-card")).toHaveCount(6);
  await expect(page.getByText("查看提示词不会触发 AI 执行", { exact: false })).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const card of await page.locator("article.ws-method-card").all()) {
      await expect(card).toBeVisible();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `Methods guide must not overflow at ${width}px`,
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`methods-guide-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("link", { name: "返回项目列表" }).click();

  await page.getByRole("link", { name: "方法测试项目", exact: true }).click();
  await page.getByRole("link", { name: "选择管理方法，辅助分析当前项目", exact: false }).click();
  await expect(page).toHaveURL(/view=methods.*project=/);
  await page.getByRole("link", { name: "返回当前项目" }).click();
  await expect(page).toHaveURL(/view=projects.*project=/);
  await expect(page.getByRole("heading", { name: "目标与进展" })).toBeVisible();
});
