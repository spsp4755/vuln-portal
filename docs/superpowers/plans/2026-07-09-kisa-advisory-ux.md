# KISA Advisory UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KISA update advisories easy to find, triage, and open from the UI.

**Architecture:** Reuse existing KISA RSS data and compute a display type from title/source/description. Add one read API and one page; avoid schema churn.

**Tech Stack:** Next.js 14 App Router, React 18, Prisma, TypeScript, existing Phosphor icons.

## Global Constraints

- No new dependency.
- No migration for derived display-only type.
- CVE-less KISA notices must show on the KISA page.
- Existing filters remain compatible.

---

### Task 1: KISA Notice Classification

**Files:**
- Create: `src/lib/kisa-notice.ts`
- Create: `scripts/check-kisa-notice.ts`

**Interfaces:**
- Produces: `classifyKisaNotice(input: { title?: string | null; description?: string | null; source?: string | null }): KisaNoticeKind`

- [ ] Write failing self-check for update advisories, CISA exploit notices, KNVD vulnerabilities, and generic notices.
- [ ] Run `npx.cmd tsx scripts/check-kisa-notice.ts` and confirm it fails because the module does not exist.
- [ ] Implement the classifier with simple string matching.
- [ ] Run the self-check and confirm it passes.

### Task 2: KISA Notices API

**Files:**
- Create: `src/app/api/kisa/notices/route.ts`

**Interfaces:**
- Consumes: `classifyKisaNotice`
- Produces: `GET /api/kisa/notices?kind=&q=&limit=`

- [ ] Return latest KISA notices with derived `kind`, `kindLabel`, `kindColor`, and `vulnerability.cveId`.
- [ ] Return summary counts by kind.
- [ ] Keep limit capped at 100.

### Task 3: KISA Advisory Page

**Files:**
- Create: `src/app/kisa/page.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/kisa/notices`

- [ ] Add a dense summary header and type filter buttons.
- [ ] Render notices with source, date, type, title, CVE chips, and source-link action.
- [ ] Add the page to the sidebar under vulnerability workflows.

### Task 4: CVE List And Detail UX

**Files:**
- Modify: `src/app/api/vulnerabilities/route.ts`
- Modify: `src/app/vulnerabilities/page.tsx`
- Modify: `src/app/cve/[cveId]/page.tsx`

**Interfaces:**
- Consumes: `kisaKind=update_advisory`

- [ ] Add an `업데이트 권고` list filter that narrows to KISA-linked update advisories.
- [ ] Display `KISA 권고` badges where relevant.
- [ ] Add a KISA notices section on CVE detail.

### Task 5: Verification

**Files:**
- No new source files.

- [ ] Run `npx.cmd tsx scripts/check-kisa-notice.ts`.
- [ ] Run `npx.cmd prisma generate`.
- [ ] Run `npm.cmd run build`.
- [ ] Run local app and visually verify `/kisa`, `/vulnerabilities?kisaKind=update_advisory`, and a CVE detail page with KISA notices.
