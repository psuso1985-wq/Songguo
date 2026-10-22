import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './commercial-demo.module.css';

export const DEMO_DISCLAIMER = '当前为交互演示，使用虚构数据；角色操作由访问者模拟完成，不连接真实企业系统。AI 检查内容按实际实现标为示意或规则检查。请勿输入真实业务、个人或敏感信息。';

export function PublicHeader() {
  return <header className={styles.header}>
    <Link className={styles.brand} href="/" aria-label="松果智序首页">
      <span className={styles.brandMark} aria-hidden="true">智</span>
      <span>松果智序</span>
    </Link>
    <nav className={styles.nav} aria-label="公开体验导航">
      <Link href="/#product-value">产品价值</Link>
      <Link href="/#workflow">工作如何推进</Link>
      <Link href="/#experience">体验说明</Link>
      <Link href="/pilot">企业试点</Link>
    </nav>
  </header>;
}

export function PublicFooter() {
  return <footer className={styles.footer}>
    <p><strong>松果智序 · 让工作有序，让判断有据</strong></p>
    <p>当前演示使用虚构数据，不代表完整生产系统。</p>
  </footer>;
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className={styles.page}>
    <a className={styles.skipLink} href="#main-content">跳到主要内容</a>
    <PublicHeader />
    {children}
    <PublicFooter />
  </div>;
}
