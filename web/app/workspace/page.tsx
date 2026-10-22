import { Suspense } from 'react';
import WorkspaceApp from './workspace-app';
import { pageTitle } from '../../lib/product-brand';
import './workspace.css';

export const metadata = { title: pageTitle('我的工作空间'), description: '带上你的团队、Agent 和资料，完成自己的可验收项目。' };
export default function WorkspacePage() { return <Suspense fallback={<p className="ws-loading">正在打开工作空间…</p>}><WorkspaceApp /></Suspense>; }
