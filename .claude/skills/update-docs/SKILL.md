---
name: update-docs
description: Use only when the product owner says to update the docs ("update the docs", "update AGENTS.md / plan.md", "sync the docs"). How to find what's stale since the last doc update, what each doc holds, and how to edit them with the fewest changes. Never use it on your own initiative; without that request, ask instead (AGENTS.md §1).
---

# Updating the docs (only when the product owner asks)

Doc updates are costly, so they happen in batches, on request. Between requests, keep a short "stale docs" list
in your turn summaries and ask; don't edit.

## 1. Find what changed since the docs were last touched

```bash
git log -1 --format='%h %ad %s' --date=short -- AGENTS.md plan.md docs   # last doc update
git log --oneline <that-hash>..HEAD                                       # what happened since
git diff --stat <that-hash>..HEAD -- apps infra docker .github            # which areas moved
```

Then list the stale items, one line each, and show the list to the product owner before editing if it's more than
a few lines of change. Update only what they asked for.

## 2. Which doc holds what

| Doc                                | Holds                                                      | Update when                                     |
| ---------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| `AGENTS.md` §2                     | Status table, test counts, "Next", open questions          | Something merged or the priorities changed      |
| `AGENTS.md` §4, §6, §8             | Repo map, commands, gotchas                                | New folder/script/command, or a new pitfall hit |
| `plan.md`                          | Phase checklists, decisions log (D1…)                      | An item finished, or a decision was made        |
| `docs/database-design.md`          | Seat locks, booking lifecycle, constraints, token families | Schema/constraint/lifecycle change              |
| `docs/er-diagram.mmd`              | ER diagram (`/er-diagram`)                                 | Tables or relations changed                     |
| `docs/security.md`                 | WEB-/API-/DB-/OPS- controls                                | A control was added or changed                  |
| `infra/README.md`, `plan-infra.md` | AWS setup and status                                       | Infra changed                                   |
| `README.md`                        | Quick start                                                | Setup steps changed                             |
| `.claude/skills/*`                 | Procedures                                                 | A procedure changed                             |

`docs/openapi.yaml` is not part of this: it changes with the code (contract first, `api-contract-change` skill).

## 3. Edit cheaply

- Edit in place with small diffs; don't rewrite sections or reflow paragraphs that didn't change.
- Facts only: counts from the latest `npm run test:report`, hashes from `git log`, dates as YYYY-MM-DD.
- Keep the existing tone and table shapes. Prettier: `npx prettier --end-of-line auto --write <files>`.
- Don't duplicate: say it in one doc and point to it from the others.
- One commit, `docs: …`, listing which docs changed.
