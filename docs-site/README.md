# NextAPI Docs (Docusaurus)

Public-facing documentation for **docs.nextapi.top** (EN + 中文).

## Who should read what

| Audience | Start here |
|----------|------------|
| Non-developers | [Non-developers](./docs/non-coder-guide.md) (EN) / [零基础](./i18n/zh/docusaurus-plugin-content-docs/current/non-coder-guide.md) |
| Operators (repo) | [`../docs/BEGINNERS-GUIDE-ZH.md`](../docs/BEGINNERS-GUIDE-ZH.md) — longer Chinese primer |

## Commands

```bash
cd docs-site
pnpm install
pnpm start          # dev, default locale en
pnpm start:zh       # dev, Chinese
pnpm build          # production static output → build/ and build/zh/
```

## Notes

- Homepage is `docs/index.md` with `slug: /`. Do **not** set another doc to `slug: /` (Quick Start used to — fixed).
- Sidebar: `sidebars.ts`. Broken links fail the build (`onBrokenLinks: throw`).
