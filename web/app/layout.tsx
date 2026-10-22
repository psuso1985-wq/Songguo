import type { Metadata } from 'next';
import './styles.css';
import { PRODUCT_BRAND, pageTitle } from '../lib/product-brand.ts';

// Every page.tsx under app/ sets its own full `metadata.title` via
// pageTitle('Section') (e.g. "Agent · 松果智序 AI 平台"), so this root
// metadata intentionally does NOT use Next's title.template -- templating
// on top of an already-full child title would double the product name.
export const metadata: Metadata = {
  title: pageTitle(),
  applicationName: PRODUCT_BRAND.productName,
  description: '把目标、进展、成果、证据和负责人的决定放在同一条工作线上，让团队看清做到哪里、卡在哪里、下一步谁来做。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><aside className="trial-license-notice" aria-label="版本使用范围">个人试用版 · 仅限个人非商业试用，不授予商用许可。</aside>{children}</body>
    </html>
  );
}
