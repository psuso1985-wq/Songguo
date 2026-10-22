import Link from 'next/link';
import { PublicPage } from './public-shell';
import styles from './commercial-demo.module.css';

export function PilotPage() {
  return <PublicPage>
    <main id="main-content" className={styles.main}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>企业试点 · 只读说明</p>
          <h1>从一项重要工作开始，而不是一次改变所有流程</h1>
          <p className={styles.heroLead}>试点适合有明确负责人、需要持续推进并核对成果的工作，例如部门重点事项、管理改善或跨部门项目。</p>
          <p className={styles.heroLead}>建议先明确目标、责任人和结果条件，在约6周的有限范围内观察使用与管理变化，再讨论是否继续。</p>
          <div className={styles.actions}>
            <Link className={styles.primaryButton} href="/demo">体验虚构企业项目</Link>
            <Link className={styles.secondaryButton} href="/workspace">创建我的工作空间</Link>
          </div>
        </div>
        <aside className={styles.heroPanel}>
          <span className={`${styles.status} ${styles.statusWarn}`}>待确认的服务方案</span>
          <h2>当前限制</h2>
          <p>试点是待确认的服务方案，不是公开演示已具备真实企业交付能力的证明。具体范围、数据边界、交付条件和费用须另行确认。</p>
        </aside>
      </section>
    </main>
  </PublicPage>;
}
