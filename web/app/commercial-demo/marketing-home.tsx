import Link from 'next/link';
import { DEMO_DISCLAIMER, PublicPage } from './public-shell';
import styles from './commercial-demo.module.css';

export function MarketingHome() {
  return <PublicPage>
    <main id="main-content" className={styles.main}>
      <section id="product-value" className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>松果智序</p>
          <h1>让重要工作真正推进到结果</h1>
          <p className={styles.heroLead}>把目标、进展、成果、证据和负责人的决定放在同一条工作线上，让团队看清做到哪里、卡在哪里、下一步谁来做。</p>
          <div className={styles.actions} aria-label="首页入口">
            <Link className={styles.primaryButton} href="/demo">体验虚构企业项目</Link>
            <Link className={styles.secondaryButton} href="/workspace">创建我的工作空间</Link>
            <Link className={styles.textLink} href="/pilot">了解企业试点</Link>
          </div>
          <p className={styles.disclaimer}>{DEMO_DISCLAIMER}</p>
        </div>
        <aside className={styles.heroPanel} aria-label="虚构示例项目概览">
          <span className={`${styles.status} ${styles.statusInfo}`}>虚构示例 · 演示第10天</span>
          <h2>示例企业·干部培养方案制定</h2>
          <p>这不是人员评价工具，也不涉及真实员工。演示重点是项目如何留下成果与判断依据。</p>
          <dl className={styles.projectFacts}>
            <dt>当前阶段</dt><dd>对象范围与评价依据确认</dd>
            <dt>卡点</dt><dd>草案缺少选拔评价依据</dd>
            <dt>下一步</dt><dd>补充评价依据说明并提交V2</dd>
          </dl>
        </aside>
      </section>

      <section className={styles.section} aria-labelledby="value-heading">
        <h2 id="value-heading">让工作有序，让判断有据</h2>
        <div className={styles.featureGrid}>
          <article className={styles.feature}><h3>看得清</h3><p>现在处于哪个阶段，什么已完成，什么仍在等待。</p></article>
          <article className={styles.feature}><h3>有依据</h3><p>报告对应哪份成果，谁核对过，为什么接受或退回。</p></article>
          <article className={styles.feature}><h3>留得下</h3><p>修订和决定随工作保留，接手时有迹可循。</p></article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="problem-heading">
        <h2 id="problem-heading">工作有了记录，为什么还需要反复问进度？</h2>
        <ul className={styles.problemList}>
          <li>会议决定了下一步，却不知道谁在等待谁。</li>
          <li>报告写着“已经完成”，但成果和依据分散在不同地方。</li>
          <li>项目换人接手，原来的判断理由和修订过程难以找回。</li>
        </ul>
        <p className={styles.sectionLead}>松果智序尝试把这些分散信息放到同一条工作线上，帮助负责人看清事实，再做判断。</p>
      </section>

      <section id="workflow" className={styles.section} aria-labelledby="workflow-heading">
        <h2 id="workflow-heading">一份培养方案，如何从草案走到负责人确认？</h2>
        <div className={styles.split}>
          <div>
            <p className={styles.sectionLead}>这里是一家完全虚构企业的示例项目。你将体验：查看阶段、提交草案、核对证据、退回补充、重新提交，再记录接受。</p>
            <p className={styles.sectionLead}>这不是人员评价工具，也不涉及真实员工。演示重点是项目如何留下成果与判断依据。</p>
            <div className={styles.actions}><Link className={styles.primaryButton} href="/demo">开始这次演示</Link></div>
          </div>
          <aside className={styles.panel}>
            <h2>报告—证据—决定</h2>
            <p>看状态 → 上报草案与缺口 → 查看检查示意 → 核对证据 → 负责人退回 → 补齐材料形成新版本 → 负责人接受当前阶段成果 → 查看完整历史。</p>
          </aside>
        </div>
      </section>

      <section id="experience" className={styles.section} aria-labelledby="boundary-heading">
        <h2 id="boundary-heading">检查提供线索，决定仍由负责人作出</h2>
        <p className={styles.sectionLead}>在产品设计中，AI可以辅助整理信息、提示风险和缺口；是否接受成果、是否推进下一阶段，由负责人确认。</p>
        <div className={styles.split}>
          <dl className={styles.boundaryList}>
            <div><dt>当前可体验：</dt><dd>报告、合成证据、人工退回与接受、修订历史，以及明确标识的检查示意。</dd></div>
            <div><dt>不属于当前演示承诺：</dt><dd>真实Agent自动执行、真实企业数据接入、无人值守持续巡检、企业生产级部署与运行保障。</dd></div>
          </dl>
          <p className={styles.disclaimer}>{DEMO_DISCLAIMER}</p>
        </div>
      </section>

      <section id="pilot" className={styles.section} aria-labelledby="pilot-heading">
        <h2 id="pilot-heading">从一项重要工作开始，而不是一次改变所有流程</h2>
        <p className={styles.sectionLead}>试点适合有明确负责人、需要持续推进并核对成果的工作，例如部门重点事项、管理改善或跨部门项目。</p>
        <p className={styles.sectionLead}>建议先明确目标、责任人和结果条件，在约6周的有限范围内观察使用与管理变化，再讨论是否继续。</p>
        <p className={styles.sectionLead}>试点是待确认的服务方案，不是公开演示已具备真实企业交付能力的证明。具体范围、数据边界、交付条件和费用须另行确认。</p>
        <div className={styles.actions}><Link className={styles.secondaryButton} href="/pilot">查看试点说明</Link></div>
      </section>
    </main>
  </PublicPage>;
}
