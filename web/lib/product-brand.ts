// User-facing brand labels are separate from persisted technical identifiers.
// Keep existing API paths, environment keys, database names and storage keys.
export const PRODUCT_BRAND = Object.freeze({
  productName: '松果智序 AI 平台',
  shortName: '智序',
  technicalName: 'AIsys',
});

// Browser tab / <title> text for a page. `pageTitle()` with no argument is
// just the bare product name (root layout default); `pageTitle('Agent')`
// produces "Agent · 松果智序 AI 平台", matching how every page.tsx already
// sets its own `metadata.title`.
export function pageTitle(section?: string): string {
  return section ? `${section} · ${PRODUCT_BRAND.productName}` : PRODUCT_BRAND.productName;
}

// The small "AIsys Next / X" breadcrumb/eyebrow line AppShell renders above
// each page's <h1>. Uses the short name so it stays compact in the sidebar
// topbar at narrow widths.
export function brandEyebrow(section?: string): string {
  return section ? `${PRODUCT_BRAND.shortName} / ${section}` : PRODUCT_BRAND.shortName;
}
