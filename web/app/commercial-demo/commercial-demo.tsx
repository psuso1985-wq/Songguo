'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  COMMERCIAL_DEMO_STORAGE_KEY,
  COMMERCIAL_DEMO_STAGES,
  INITIAL_COMMERCIAL_DEMO_STATE,
  commercialDemoGapStatus,
  commercialDemoStageIndex,
  nextCommercialDemoStage,
  readCommercialDemoState,
  type CommercialDemoStage,
} from '../../lib/commercial-demo-v1';
import { DEMO_DISCLAIMER, PublicPage } from './public-shell';
import styles from './commercial-demo.module.css';

type TimelineItem = {
  id: 'R1' | 'V1' | 'D1' | 'R2' | 'V2' | 'D2';
  requiredStage: CommercialDemoStage;
  kind: string;
  title: string;
  summary: string;
  detail: string;
};

const TIMELINE: TimelineItem[] = [
  {
    id: 'R1',
    requiredStage: 'R1_REPORTED',
    kind: '执行负责人自报',
    title: '培养对象范围草案 V1 已提交',
    summary: '已完成培养对象范围草案V1。评价依据尚未补齐，下一步先补充依据说明，再提请审批负责人确认。',
    detail: '报告 R1 引用《培养对象范围草案V1（虚构示例）》；报告是执行人陈述，不自动成为正式验收结论。',
  },
  {
    id: 'V1',
    requiredStage: 'R1_REPORTED',
    kind: '合成证据 · 虚构示例',
    title: '培养对象范围草案 V1',
    summary: '包含岗位范围、培养目标和待确认事项；明确标注“评价依据待补充”。',
    detail: '岗位范围：部门负责人及后备岗位（虚构范围）；培养目标：形成阶段培养计划；资料缺口：尚无评价依据说明。本材料不含真实姓名、照片或绩效数据。',
  },
  {
    id: 'D1',
    requiredStage: 'D1_RETURNED',
    kind: '审批负责人正式决定',
    title: '退回并要求补充',
    summary: '请提供评价依据说明，并在草案中注明与该说明的关联。',
    detail: '决定 D1 保留 R1、V1 与退回理由之间的关联；正式状态为“待补充”，原报告和材料没有被删除或覆盖。',
  },
  {
    id: 'R2',
    requiredStage: 'R2_REPORTED',
    kind: '执行负责人自报',
    title: '补齐材料并提交 R2',
    summary: '新增评价依据说明 V1，并提交培养对象范围草案 V2。',
    detail: '报告 R2 同时引用《评价依据说明V1（虚构示例）》与《培养对象范围草案V2（虚构示例）》，旧版本继续可查。',
  },
  {
    id: 'V2',
    requiredStage: 'R2_REPORTED',
    kind: '合成证据 · 虚构示例',
    title: '培养对象范围草案 V2',
    summary: '引用评价依据说明并补齐培养对象范围。',
    detail: '评价依据仅说明本阶段资料完整性与适用范围，不对任何真实个人自动评级，也不作人员选拔决定。',
  },
  {
    id: 'D2',
    requiredStage: 'D2_ACCEPTED',
    kind: '审批负责人正式决定',
    title: '接受当前阶段交付物',
    summary: 'R2、评价依据说明 V1 与草案 V2 满足本阶段确认条件。',
    detail: '阶段接受记录关联审批角色、报告 R2、材料版本与接受理由。仅“对象范围与评价依据确认”阶段被接受；培养实施与效果评价仍未完成。',
  },
];

const STEP_LABELS = ['R1 / V1 已报告', '检查示意', 'D1 退回', 'R2 / V2 修订', 'D2 阶段接受'];

function stageAction(stage: CommercialDemoStage) {
  switch (stage) {
    case 'R1_REPORTED': return { label: '查看检查示意', note: '下一步：查看预置检查示意，核对 V1 的证据缺口。' };
    case 'CHECK_VIEWED': return { label: '记录退回决定 D1', note: '下一步：由访客模拟审批负责人作出正式退回决定。' };
    case 'D1_RETURNED': return { label: '补齐材料并提交 R2', note: '下一步：选择预置合成材料，形成 R2 与 V2。' };
    case 'R2_REPORTED': return { label: '接受当前阶段成果 D2', note: '下一步：由访客模拟审批负责人核对并接受本阶段成果。' };
    case 'D2_ACCEPTED': return { label: '', note: '当前阶段已接受；整体项目继续进行，后续仍有培养实施与效果评价。' };
  }
}

export default function CommercialDemo() {
  const [stage, setStage] = useState<CommercialDemoStage>(INITIAL_COMMERCIAL_DEMO_STATE.stage);
  const [ready, setReady] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setStage(readCommercialDemoState(window.localStorage.getItem(COMMERCIAL_DEMO_STORAGE_KEY)).stage);
    setReady(true);
  }, []);

  const stageIndex = commercialDemoStageIndex(stage);
  const action = stageAction(stage);
  const accepted = stage === 'D2_ACCEPTED';
  const gap = commercialDemoGapStatus(stage);
  const timeline = useMemo(() => TIMELINE.map((item) => ({
    ...item,
    reached: stageIndex >= commercialDemoStageIndex(item.requiredStage),
  })), [stageIndex]);

  function advance() {
    const next = nextCommercialDemoStage(stage);
    setStage(next);
    window.localStorage.setItem(COMMERCIAL_DEMO_STORAGE_KEY, JSON.stringify({ stage: next }));
    setAnnouncement(`演示已推进到：${STEP_LABELS[commercialDemoStageIndex(next)]}`);
  }

  function reset() {
    window.localStorage.removeItem(COMMERCIAL_DEMO_STORAGE_KEY);
    setStage(INITIAL_COMMERCIAL_DEMO_STATE.stage);
    setAnnouncement('已重置本次演示，仅清除当前浏览器中的演示状态。');
  }

  return <PublicPage>
    <main id="main-content" className={styles.demoMain} data-demo-stage={stage}>
      <div className={styles.demoHeading}>
        <div>
          <p className={styles.eyebrow}>完全虚构企业项目 · 项目推进与验收示例</p>
          <h1>示例企业·干部培养方案制定</h1>
          <p>本次演示仅覆盖“培养对象范围与评价依据确认”阶段，不展示真实人员，不对任何人自动评级或做选拔决定。</p>
        </div>
        <div className={styles.clock}>演示第10天<small>原计划第8天确认</small></div>
      </div>

      <p className={styles.disclaimer}>{DEMO_DISCLAIMER}</p>

      <ol className={styles.progressRail} aria-label="演示推进步骤">
        {COMMERCIAL_DEMO_STAGES.map((item, index) => <li key={item} data-reached={stageIndex >= index}>{STEP_LABELS[index]}</li>)}
      </ol>

      <section className={styles.summaryGrid} aria-label="项目当前状态">
        <article className={styles.panel}>
          <span className={`${styles.status} ${accepted ? styles.statusOk : styles.statusWarn}`}>{accepted ? '本阶段已接受' : '当前阶段尚未接受'}</span>
          <h2>目标与阶段</h2>
          <p>目标：完成培养方案的对象范围、评价依据和阶段计划。</p>
          <p>当前阶段：对象范围与评价依据确认。</p>
        </article>
        <article className={styles.panel}>
          <span className={`${styles.status} ${styles.statusInfo}`}>{accepted ? '等待后续实施安排' : '等待负责人处理'}</span>
          <h2>卡点与下一步</h2>
          <p>{accepted ? '当前阶段依据已经核对；下一步进入培养实施准备。' : gap === 'RESOLVED' ? '评价依据已在 V2 补齐，正式确认尚待负责人决定。' : '草案缺少选拔评价依据，正式确认尚未形成。'}</p>
          <p>{action.note}</p>
        </article>
        <article className={styles.panel}>
          <span className={styles.status}>浏览器本地演示状态</span>
          <h2>访客隔离</h2>
          <p>本次操作仅保存在当前浏览器中，不写入真实企业系统，也不等于企业级可靠存储。不同浏览器上下文各自保存，重置只影响当前访客。</p>
        </article>
      </section>

      <section className={styles.stateGrid} aria-label="三种状态分离">
        <article className={styles.stateCard}>
          <span className={`${styles.status} ${styles.statusInfo}`}>执行负责人自报</span>
          <h2>{stageIndex >= 3 ? 'R2 已提交' : 'R1 已提交'}</h2>
          <p>执行人的陈述与材料版本被记录，但不会自动变成负责人正式结论。</p>
        </article>
        <article className={styles.stateCard}>
          <span className={`${styles.status} ${gap === 'RESOLVED' ? styles.statusOk : styles.statusWarn}`}>检查示意 · 非实时AI自动执行</span>
          <h2>{gap === 'RESOLVED' ? '依据缺口已补齐（V2）' : gap === 'OPEN' ? '发现依据缺口' : '待访客查看'}</h2>
          <p>{gap === 'RESOLVED' ? 'V1 当时缺评价依据；R2 已补充评价依据说明并提交 V2，缺口已补齐。原检查意见保留在下方历史中。' : '计划在演示第8天形成阶段确认，目前未见正式接受记录；V1还缺评价依据。可能影响后续培养计划启动，请负责人核对。'}</p>
        </article>
        <article className={styles.stateCard}>
          <span className={`${styles.status} ${accepted ? styles.statusOk : styles.status}`}>负责人正式决定</span>
          <h2>{accepted ? 'D2 已接受本阶段' : stageIndex >= 2 ? 'D1 已退回待补充' : '尚未形成'}</h2>
          <p>是否退回、是否接受及是否推进下一阶段，均由访客模拟负责人明确确认。</p>
        </article>
      </section>

      <section className={styles.demoAction} aria-label="当前演示操作">
        <div>
          <strong>{ready ? action.note : '正在准备本次演示…'}</strong>
          <p>所有可查看材料均为预置合成示例；没有真实上传入口。</p>
          <p className={styles.liveRegion} aria-live="polite">{announcement}</p>
        </div>
        <div className={styles.actionGroup}>
          {!accepted ? <button className={styles.actionButton} type="button" onClick={advance} disabled={!ready} data-testid="demo-next">{action.label}</button> : <Link className={styles.primaryButton} href="/pilot">了解企业试点</Link>}
          <button className={styles.secondaryButton} type="button" onClick={reset} disabled={!ready} data-testid="demo-reset">重置本次演示</button>
        </div>
      </section>

      {gap !== 'NOT_VIEWED' ? <section className={styles.panel} aria-labelledby="check-heading" data-gap-status={gap}>
        <span className={`${styles.status} ${gap === 'RESOLVED' ? styles.statusOk : styles.statusWarn}`}>检查示意 · 非实时AI自动执行</span>
        <h2 id="check-heading">{gap === 'RESOLVED' ? '历史检查意见：V1 证据缺口（已补齐，V2）' : '证据缺口提示'}</h2>
        <p>{gap === 'RESOLVED' ? '当时的提示：计划在演示第8天形成阶段确认，V1 缺评价依据。该缺口已由评价依据说明与草案 V2 补齐，此条仅作历史留存，不再是当前提示。' : '计划在演示第8天形成阶段确认，目前未见正式接受记录；V1还缺评价依据。可能影响后续培养计划启动，请负责人核对。'}</p>
        <p>提示只说明证据缺口，不断言业务没有发生，也不替负责人判定项目失败。</p>
      </section> : null}

      <section className={styles.section} aria-labelledby="history-heading">
        <h2 id="history-heading">报告、证据与决定历史</h2>
        <p className={styles.sectionLead}>R1 → V1 → D1 → R2 → V2 → D2 的关系按版本保留；未到达的步骤明确标为待演示。</p>
        <ol className={styles.timeline}>
          {timeline.map((item) => <li key={item.id} className={styles.timelineItem} data-future={!item.reached}>
            <div className={styles.timelineId}>{item.id}</div>
            <div>
              <span className={styles.status}>{item.reached ? item.kind : '待演示'}</span>
              <h3>{item.title}</h3>
              <p>{item.reached ? item.summary : '完成前一步后显示本项内容。'}</p>
              {item.reached ? <details className={styles.details}>
                <summary>打开{item.id}详情</summary>
                <div><strong>虚构示例</strong><br />{item.detail}</div>
              </details> : null}
            </div>
          </li>)}
        </ol>
      </section>

      {accepted ? <aside className={styles.callout} data-testid="stage-accepted">
        <strong>当前阶段成果已接受，整个项目仍在进行中。</strong>
        <span>整体项目后续还包括培养实施和效果评价，所以接受本阶段材料绝不等于整个项目完成。</span>
      </aside> : null}

      <section className={styles.section} aria-labelledby="finish-heading">
        <h2 id="finish-heading">这是一项虚构工作。</h2>
        <p className={styles.sectionLead}>你的团队是否也有需要持续跟踪、核对成果并由负责人确认的重要事项？</p>
        <div className={styles.actions}>
          <Link className={styles.secondaryButton} href="/pilot">了解企业试点</Link>
          <button className={styles.secondaryButton} type="button" onClick={reset} disabled={!ready}>重置本次演示</button>
        </div>
      </section>
    </main>
  </PublicPage>;
}
