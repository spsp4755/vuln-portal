# KISA Advisory UX Design

Goal: make KISA update advisories visible as first-class operational items, including notices that do not map cleanly to a CVE.

Design:
- Keep KISA collection unchanged. The existing RSS feeds already collect KNVD vulnerabilities and KISA security notices.
- Add a small notice classifier that labels each KISA row as `update_advisory`, `cisa_exploit`, `knvd_vulnerability`, or `security_notice`.
- Add a KISA advisories page with summary counts, type filters, CVE chips, latest notice dates, and direct source links.
- Keep the CVE list CVE-focused, but add an `업데이트 권고` quick filter for CVE-linked KISA update notices.
- Add a KISA section to the CVE detail page so linked advisories are visible without leaving the portal.

Constraints:
- No new external dependency.
- No database migration unless unavoidable.
- CVE-less KISA notices must be visible on the new KISA page.
- Existing KISA and GHSA filters must keep working.

Testing:
- Add a self-check for notice classification.
- Run Prisma generation and Next build.
- Run the app and visually verify the new page, CVE list filter, and detail section.
