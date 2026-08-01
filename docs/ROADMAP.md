# Roadmap

Updated: 2026-08-01. The local tree is a v13.0 release candidate; v12.0
remains the latest published release.

This is the maintained roadmap. It replaces the old full feature brainstorming document, which mixed implemented features, speculative ideas, and stale project naming.

## v13.0 Release Candidate

The deterministic implementation gates are complete:

- async account-scoped storage ports and legacy-key migration;
- lifecycle scopes, module host, session isolation, start/stop rollback, and
  descriptor-driven feature switches;
- split Gemini adapter with current capability/selector fixtures;
- scoped design tokens, semantic controls, dialog stack, locale/theme isolation,
  and shell-to-feature ports;
- Local Insights, Collections, Archive, Recipes, Queue, Bulk Lifecycle,
  Search & Navigator, Preferences, and Annotations vertical features;
- versioned portable backup with validation, duplicate planning, selective
  restore, rollback, and explicit resume;
- capability health and native-ownership states;
- atomic minified userscript/MV3 builds with raw and gzip-9 budgets;
- per-file 100% statements, branches, functions, and lines for shipped
  JavaScript in `lib/`, `src/`, and `scripts/`;
- 24 separate Python store-tool tests on Windows and WSL.

The implementation and current-account evidence gates are complete. The strict
result is 38.5/40 task-equivalents (96.25%), every critical row passes, and no
task is unverified. Build/unit coverage remains separate from live evidence.

## Remaining Release Handoff

1. **Distribution review**
   - refresh screenshots from the accepted RC;
   - install the packaged extension once in a clean Chrome/Edge/Firefox profile
     to close the remaining non-critical runtime-parity evidence row;
   - verify README, privacy policy, store copy, changelog, version metadata, and
     release notes match the tested build;
   - do not change "latest published release" from v12.0 until a v13 GitHub
     release actually exists.

2. **Publish only on explicit instruction**
   - rerun `npm test`, `npm run build`, and
     `npm audit --audit-level=moderate` when the npm advisory endpoint is
     reachable;
   - inspect the dirty tree and intended release artifacts;
   - commit/tag/push only when separately authorized.

Personal-free and Workspace scores remain unclaimed unless separately
exercised. Message-target focus observation and injected-failure rendering are
retained as explicit non-critical partial evidence rather than being waived.

## Explicit Non-goals

- Reimplementing or hiding native Notebooks, Gemini chat search, Usage Limits,
  Gems/Skills, Canvas, Deep Research, or Spark scheduled actions.
- Hidden transcript collection, remote analytics, mandatory accounts/backends,
  or automatic cloud sync.
- Claiming local message estimates are Google's remaining server quota.
- Automatic retry of sends, deletes, restore application, permission grants, or
  other non-idempotent operations.
- AI Studio and generic multi-site or multi-tab automation.

## Product Positioning

Keep the product focused on Gemini web power users: local-first data,
recoverable workflows, explicit user intent, honest capability health, native
coexistence, and dual userscript/MV3 distribution.
