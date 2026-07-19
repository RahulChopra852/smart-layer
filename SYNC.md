# Two-Repo Sync Workflow

`gnc-smart-layer` = **sandbox** (live GNC dashboard, fast experiments on real data).
`smart-layer` = **product** (multi-tenant, config-driven).

The repos share full git history (`smart-layer` was cloned from `gnc-smart-layer`), so commits
cherry-pick cleanly across them. Each repo has the other as a remote:

- in `smart-layer`: remote `gnc` → `/Users/rahulchopra/Desktop/gnc-smart-layer`
- in `gnc-smart-layer`: remote `smart` → `/Users/rahulchopra/Desktop/smart-layer`

## Port a change FROM the sandbox INTO the product

```bash
cd ~/Desktop/smart-layer
git fetch gnc
git log gnc/main --oneline -15                 # find the commit(s)
git cherry-pick <sha>                          # repeat per commit, oldest first
```

## Port a change FROM the product INTO the sandbox

```bash
cd ~/Desktop/gnc-smart-layer
git fetch smart
git log smart/main --oneline -15
git cherry-pick <sha>
```

## See what one repo has that the other doesn't

```bash
git fetch gnc && git cherry -v HEAD gnc/main   # commits in gnc not in smart-layer
```

## Rules that keep this painless

1. **Same filenames both sides** for shared UI: everything under `client/src/components/` keeps
   identical paths in both repos (e.g. `DateRangePicker.jsx`, `MetaTab.jsx`).
2. **One component/concern per commit.** Never mix shared-component changes with server/data-layer
   changes — server code differs between repos and those commits must never be cherry-picked.
3. Shared components get data via props/hooks from `/api/...` endpoints with **identical response
   shapes** in both repos; no server-specific imports in components.
4. What syncs: client components, client-side detector/analytics logic, `metaParser`, styling.
   What never syncs: `server/db/*`, sync engine, auth/workspace code, migrations.
5. After cherry-picking into the sandbox, sanity-check with `npm --prefix client run build`.
