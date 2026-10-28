---
name: lead-review
description: Use in the lead (main) session when briefing a subagent, when a subagent reports back, and when merging its branch into main. Brief template, review checklist, merge and verification steps, and how to present results to the product owner. Not for subagents.
---

# Lead: brief → review → merge

## Briefing a subagent

Frontend agent owns `apps/web/**`; backend agent owns `apps/api/**`, `docker/**`, compose, `.env.example`. Continue the existing agent (it keeps context) with SendMessage; start a new one only if it's gone.

A brief contains: the goal in one line (and the product owner's words if it's their request) · setup (`git merge main` at <hash>, `npm ci`, `db:generate`) · items, each one commit · exact contract/files/behaviour, with the edge cases you already know · tests expected · which skills to load (`agent-onboarding` always; `design-system`, `database-workflow`, `api-contract-change`, `codebase-graph` as relevant) · shared files allowed · "report, then stop".

Run agents in parallel only when their files don't overlap. If a later item depends on both (e.g. web switch-over after an API), sequence it.

## Reviewing a report

1. Read the risky code yourself (`git show <branch>:<file>`), not just the report: raw SQL, auth, money, time zones, cache keys, anything touching shared state.
2. Check deviations: accept engineering calls with a reason, but **product decisions go to the product owner**. Record accepted decisions in the docs (contract notes, `plan.md` decisions log).
3. Merge: `git merge --no-ff <branch> -m "chore: merge <what>"` + co-author trailer.
4. After merging: `npm install`, `npm run db:generate -w api`, `npm run check`, and `npm run test:int -w api` when api changed. Dependencies removed → stop the dev server, `rm -rf apps/web/.next`, restart.
5. Look at UI in the browser pane yourself (the agents miss things: stale dev servers, missing messages, posters). Real-API checks: launch configs `api` (4000) + `web-real-api` (3000); afterwards put the preview back on `web` (mock).
6. Fix small issues on main as separate commits; send bigger ones back to the agent.
7. Update `AGENTS.md` §2 and `plan.md`; refresh `npm run test:report` when tests changed.

## Commits the product owner can review

They review block by block. One concern per commit (feature, merge, docs, build fix, lockfile normalization separate). After `npm install` changes the lockfile, inspect the diff and commit it on its own. Never `git stash` (the stash is shared with worktrees).

## Talking to the product owner

Summarize before each new phase and ask for the go-ahead. Report what you verified yourself vs what only the agent claims. List commits with one line each. Flag Thai copy written by agents for their review. Outward-facing actions (GitHub push, anything public) need an explicit yes.
