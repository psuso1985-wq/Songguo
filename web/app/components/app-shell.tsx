'use client';

import { Fragment, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PRODUCT_BRAND } from '../../lib/product-brand.ts';

// P1 product-navigation-v1: the primary navigation answers user tasks, not
// "which pages happen to exist". Existing deep links stay valid; secondary
// utilities remain reachable below the Core product entries.
export type NavKey =
  | 'desk'
  | 'project-center'
  | 'agents'
  | 'resources'
  | 'discussion'
  | 'skills'
  | 'methods'
  | 'mail-settings'
  | 'evolution';

export type NavEntry = { key: string; label: string; href: string; icon: string };

const PRIMARY_NAV: NavEntry[] = [
  { key: 'desk', label: '工作台', href: '/desk', icon: '☀' },
  { key: 'project-center', label: '项目', href: '/projects', icon: '◆' },
  { key: 'agents', label: 'Agent', href: '/agents', icon: '◉' },
  { key: 'resources', label: '方法与资源', href: '/resources', icon: '⬡' },
];

const SECONDARY_NAV: NavEntry[] = [
  { key: 'discussion', label: '全部讨论', href: '/discussion', icon: '◇' },
  { key: 'mail-settings', label: '邮件设置', href: '/settings/mail', icon: '✉' },
  { key: 'evolution', label: '版本与演进', href: '/evolution', icon: '◷' },
];

function normalizeActiveKey(key: NavKey | undefined): NavKey | undefined {
  if (key === 'skills' || key === 'methods') return 'resources';
  return key;
}

function deriveActiveKey(pathname: string): NavKey | undefined {
  if (pathname === '/desk' || pathname.startsWith('/desk/')) return 'desk';
  if (pathname === '/projects' || pathname.startsWith('/projects/') || pathname.startsWith('/project-reports') || pathname.startsWith('/work-management') || pathname === '/inspirations') return 'project-center';
  if (pathname === '/agents' || pathname.startsWith('/agents/')) return 'agents';
  if (pathname === '/resources' || pathname.startsWith('/resources/') || pathname === '/skills' || pathname.startsWith('/skills/') || pathname === '/methods' || pathname.startsWith('/methods/')) return 'resources';
  if (pathname === '/discussion' || pathname.startsWith('/discussion/')) return 'discussion';
  if (pathname === '/settings/mail' || pathname.startsWith('/settings/mail/')) return 'mail-settings';
  if (pathname === '/evolution' || pathname.startsWith('/evolution/')) return 'evolution';
  return undefined;
}

export type AppShellProps = {
  active?: NavKey;
  eyebrow: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  tools?: ReactNode;
  sidebarFoot?: string;
  children: ReactNode;
  navigation?: { primary: NavEntry[]; secondary: NavEntry[]; active: string; caption?: string };
};

function NavLinks({ entries, active }: { entries: NavEntry[]; active?: string }) {
  return <>
    {entries.map((entry) => {
      const isActive = entry.key === active;
      return <Link
        key={entry.key}
        className={isActive ? 'nav-item nav-link active' : 'nav-item nav-link'}
        href={entry.href}
        aria-label={entry.label}
        aria-current={isActive ? 'page' : undefined}
      ><span>{entry.icon}</span> {entry.label}</Link>;
    })}
  </>;
}

export function AppShell({ active: activeProp, eyebrow, title, badge, tools, sidebarFoot, children, navigation }: AppShellProps) {
  const pathname = usePathname();
  const active = normalizeActiveKey(activeProp ?? deriveActiveKey(pathname));
  const topbarRight = tools && badge ? <div className="topbar-tools">{tools}{badge}</div> : (tools ?? badge ?? null);

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand" title={PRODUCT_BRAND.productName}><span className="brand-mark">智</span><span>{PRODUCT_BRAND.shortName}</span></div>
      <p className="sidebar-caption">{navigation?.caption || '组织正式事实'}</p>
      <nav className="sidebar-primary" aria-label="主要导航">
        <NavLinks entries={navigation?.primary || PRIMARY_NAV} active={navigation?.active || active} />
      </nav>
      <div className="sidebar-secondary">
        <p>更多与设置</p>
        <nav aria-label="更多与设置">
          <NavLinks entries={navigation?.secondary || SECONDARY_NAV} active={navigation?.active || active} />
        </nav>
      </div>
      {sidebarFoot ? <div className="sidebar-foot">
        {sidebarFoot.split('\n').map((line, index) => <Fragment key={index}>{index > 0 ? <br /> : null}{line}</Fragment>)}
      </div> : null}
    </aside>
    <section className="main">
      <header className="topbar">
        <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
        {topbarRight}
      </header>
      {children}
    </section>
  </main>;
}
