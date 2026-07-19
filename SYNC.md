# Two-Repo Sync Workflow

`gnc-smart-layer` = **sandbox** (live GNC dashboard, fast experiments on real data).
`smart-layer` = **product** (multi-tenant, serves ALL brands).

## The one rule: changes flow ONE WAY — sandbox → product

**Never push feature work directly to `smart-layer`.** A bad change here impacts every brand at
once. All dashboard/feature/shared-component work is developed and validated in the sandbox
against live GNC data first, then **promoted** here by cherry-pick. If a bug is discovered in the
product's shared UI, reproduce and fix it in the sandbox, then promote the fix — don't patch it
here directly.

The only code written directly in `smart-layer` is **product-only infrastructure** that cannot
exist in the sandbox: workspaces/auth, connectors, the setup-form framework, migrations, the sync
engine. Even that goes through a feature branch and a staging check before merging to `main` —
`main` is what all brands run.

The repos share full git history (`smart-layer` was cloned from `gnc-smart-layer`), so commits
cherry-pick cleanly across them. Remote: in `smart-layer`, `gnc` →
`/Users/rahulchopra/Desktop/gnc-smart-layer` (the sandbox also has a `smart` remote for
inspection/fetching, not for pushing features).

## Promote a validated change from the sandbox

```bash
cd ~/Desktop/smart-layer
git fetch gnc
git log gnc/main --oneline -15                 # find the commit(s)
git cherry-pick <sha>                          # repeat per commit, oldest first
npm --prefix client run build                  # verify before merging/deploying
```

## See what the sandbox has that the product doesn't

```bash
git fetch gnc && git cherry -v HEAD gnc/main   # + lines = not yet promoted
```

## Rules that keep this painless

1. **Same filenames both sides** for shared UI: everything under `client/src/components/` keeps
   identical paths in both repos (e.g. `DateRangePicker.jsx`, `MetaTab.jsx`).
2. **One component/concern per commit.** Never mix shared-component changes with server/data-layer
   changes — server code differs between repos and those commits must never be cherry-picked.
3. Shared components get data via props/hooks from `/api/...` endpoints with **identical response
   shapes** in both repos; no server-specific imports in components.
4. What promotes: client components, client-side detector/analytics logic, `metaParser`, styling.
   What never crosses: `server/db/*`, sync engine, auth/workspace code, migrations.
5. Always `npm --prefix client run build` after a cherry-pick before considering it promoted.
