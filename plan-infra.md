# plan-infra.md — AWS layout (demo-cheap profile)

Status: **planned, Phase 0 next**. Owner: lead + product owner. Each phase is one reviewed commit (or PR) and we stop
after each one to check it together before the next. `docs/deploy-aws.md` (one EC2 + CloudFront) stays as the
throwaway fast path; this file replaces it once Phase 6 is live.

**Profile: demo.** Same shape as production (S3 + OAC + CloudFront, ECS Fargate, RDS, VPC with public and private
subnets), but every always-on cost is cut to the minimum, and the stack can **sleep** between demos. §8 lists what
to switch on for real production later; each item is a Terraform variable or a small module change, not a redesign.

## 1. Why this costs more than a static portfolio

A portfolio on S3 + CloudFront is files only: you pay per request and per GB, so an idle site costs cents. This app
also needs things that **run all the time** and AWS bills them **per hour, even with zero visitors**:

| Always-on piece            | Why it exists                                        | Production price | Demo choice                                       |
| -------------------------- | ---------------------------------------------------- | ---------------- | ------------------------------------------------- |
| NAT gateway                | lets private tasks reach Stripe / ECR                | ~USD 45          | **later** (Phase 9): tasks sit in public subnets  |
| ALB                        | stable target for CloudFront, health checks, rolling | ~USD 18          | keep (internal, so no public IPv4 fee)            |
| Fargate tasks              | the NestJS API                                       | ~USD 25–30 (2)   | **1 task, 0.25 vCPU / 0.5 GB, Spot**              |
| RDS                        | Postgres                                             | ~USD 15–18       | `db.t4g.micro`, single-AZ, 1-day backup           |
| WAF                        | managed rules                                        | ~USD 8           | **keep** (product owner, I3)                      |
| Secrets Manager / KMS keys | secret storage                                       | ~USD 3           | **SSM Parameter Store** + AWS-managed keys (free) |

Check **Billing → Credits / Free Tier** in Phase 0: new-account credits or the 12-month free tier (RDS micro, ALB)
can cover most of the demo.

## 2. Target architecture (demo)

```
                  ┌────────────────────────── AWS account (ap-southeast-7 + us-east-1 for edge) ──────────────────────────┐
 Browser ─https─► │ WAF ─► CloudFront  (dxxxx.cloudfront.net)                                                           │
                  │   default  /*     ─► S3 bucket (private, OAC)   static export, CloudFront Function .html rewrite      │
                  │   behavior /api/* ─► VPC origin ─► internal ALB                                                     │
                  │  ┌──────────────────────────────── VPC 10.20.0.0/16, 2 AZs ──────────────────────────────────────┐ │
                  │  │ public  subnets (a, b)   IGW. Fargate task "api" (1, Spot) with a public IP for egress only:    │ │
                  │  │                          its SG admits nothing except the ALB on 4000                           │ │
                  │  │                          one-off tasks: migrate, seed, db-bootstrap                             │ │
                  │  │ private app subnets (a, b) internal ALB (no public IP)                                          │ │
                  │  │ private db  subnets (a, b) RDS PostgreSQL 17 (no route to the internet)                         │ │
                  │  └────────────────────────────────────────────────────────────────────────────────────────────────┘ │
                  │  ECR · SSM Parameter Store · CloudWatch Logs (7 days) · Budgets                                       │
                  └───────────────────────────────────────────────────────────────────────────────────────────────────────┘
 GitHub Actions ─OIDC─► deploy roles (terraform plan/apply, push images, run migrate task, sync S3, invalidate)
 Stripe ─https─► CloudFront /api/v1/payments/webhook ;  API ─IGW─► api.stripe.com
```

| Choice                                      | Why                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| One CloudFront, `/api/*` behavior           | Same origin as today's nginx: no CORS, refresh cookie stays first-party, `Origin` guard keeps working (API-5).                              |
| **Internal** ALB via CloudFront VPC origin  | Only CloudFront can reach the API. VPC origins are free, and an internal ALB pays no public IPv4 fee.                                       |
| S3 + OAC, bucket fully private              | OAC signs requests with SigV4; bucket policy allows only this distribution.                                                                 |
| CloudFront Function on the default behavior | Static export emits `/en/showtime.html`; nginx did `try_files $uri $uri.html`. The function rewrites `/x` → `/x.html`, `/` → `/index.html`. |
| Response headers policy                     | Moves nginx's CSP / HSTS / nosniff / Referrer / Permissions / frame headers to CloudFront (WEB-2, WEB-3).                                   |
| Tasks in public subnets, no NAT             | Saves ~USD 45. Outbound (ECR, Stripe, SSM, logs) goes via the IGW. Inbound is closed by the task SG (ALB only). NAT comes in Phase 9.       |
| RDS in isolated db subnets                  | Kept even in the demo: no route to the internet, no public access (DB-7).                                                                   |
| Migrations as a one-off ECS task            | Same image, `prisma migrate deploy` as `migrator`, before the service rolls (DB-8). Never inside API start.                                 |
| SSM Parameter Store `SecureString`          | Free tier, injected by ECS as `secrets`, same as Secrets Manager for our use. No secrets in task env JSON or images (OPS-5).                |
| Sleep / wake scripts                        | `infra/scripts/sleep.sh`: service to 0, RDS stopped, seed schedule disabled. Leaves only the ALB billing (~USD 0.6/day).                    |
| Terraform in `infra/`, state in S3          | Reviewable, repeatable, `destroy` to stop paying entirely. S3 native lockfile (`use_lockfile`), no DynamoDB.                                |
| GitHub OIDC                                 | No long-lived AWS keys anywhere (OPS-5).                                                                                                    |

## 3. Decisions (product owner, 2026-10-30)

| #   | Decision                                                                                                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Terraform from day one.** Console only to look around.                                                                                                                                                                                                                |
| D2  | **Region `ap-southeast-7` (Bangkok).** CloudFront VPC origins are supported there with no AZ exceptions (CloudFront Developer Guide, checked 2026-10-30). Phase 0 confirms `db.t4g.micro`, Fargate ARM64 + Fargate Spot, and the RDS Postgres 17 minor version via CLI. |
| D3  | **`*.cloudfront.net` first.** A domain (Route 53 + ACM in `us-east-1`) can be added later without rebuilds.                                                                                                                                                             |
| D4  | **No demo account on AWS.** Register a real test account.                                                                                                                                                                                                               |
| D5  | **Stripe test mode on AWS.** `PAYMENTS_PROVIDER=stripe`; `/__demo/pay` is never public. Test keys needed by Phase 7.                                                                                                                                                    |
| D6  | **Demo-cheap profile** (this file). Budget alarm USD 50/month, alerts at 50 / 80 / 100 %.                                                                                                                                                                               |
| D7  | **Sleep between demos** (`sleep.sh` / `wake.sh`); `terraform destroy` after a final snapshot when done for weeks.                                                                                                                                                       |

## 4. Code changes the AWS layout needs (small, done inside the phase that needs them)

1. **RDS TLS** (Phase 3): RDS Postgres 17 forces SSL. Bundle the RDS global CA in the API image and connect with
   `sslmode=verify-full` (the `pg` adapter gets `ssl: { ca }`). Integration tests stay on plain local Postgres.
2. **Role bootstrap on RDS** (Phase 3): a variant of `docker/postgres/init/01-roles-and-databases.sh` for RDS
   (master is not superuser: `GRANT migrator TO <master>` before `CREATE DATABASE … OWNER migrator`, no `CREATEDB`,
   no test DB). Run once as a one-off task with the `postgres:17` image.
3. **Seed image** (Phase 4): seed runs from the `build` target (needs `tsx`). Push it as a second repo
   `movie-api-seed`. Showtimes cover 31 days, so a **daily scheduled seed** (EventBridge Scheduler) keeps the
   schedule rolling (the seed only adds). `wake.sh` also runs it once, in case the stack slept for days.
4. **Small task size** (Phase 4): 0.25 vCPU / 0.5 GB on ARM64. Check argon2's native build on ARM64 musl and that
   memory holds under login load (argon2id params × concurrent logins); fall back to 1 GB if not. Turn on
   `readonlyRootFilesystem` and mount an empty `/tmp` if anything writes there.
5. **Web build for S3** (Phase 6): `next build` with `NEXT_PUBLIC_API_BASE_URL=/api/v1`, `finalize-build.mjs` still
   guards `out/`. Upload with two cache classes: `_next/static/*` immutable 1 year, HTML `no-cache`.

API env on ECS (non-secret): `NODE_ENV=production`, `PORT=4000`, `TRUST_PROXY_HOPS=2` (CloudFront + ALB),
`WEB_ORIGINS=https://<public origin>`, `COOKIE_SECURE=true`, `SWAGGER_ENABLED=false`, `JOBS_ENABLED=true`,
`DB_POOL_MAX=5` (`db.t4g.micro` allows ~80 connections). From SSM: `DATABASE_URL`, `JWT_SECRET`,
`REFRESH_TOKEN_PEPPER`, `TICKET_QR_SECRET`, `STRIPE_*`; `MIGRATION_DATABASE_URL` only on the migrate task.

## 5. Phases

Each phase: what gets built, what "done" means, and what it adds per month always-on (list prices, rounded; check
the Bangkok prices in the pricing calculator in Phase 0).

### Phase 0 — Account and guardrails (console, ~1 h)

- Root user: MFA, no access keys. Admin access through **IAM Identity Center** (SSO user), `aws sso login` locally.
- Budget alarm USD 50 (D6), Cost Explorer on, billing alerts to your email. Look at Credits / Free Tier.
- Turn on: CloudTrail (one trail, management events only: the first trail is free), IAM Access Analyzer, S3
  account-level Block Public Access.
- Check Bangkok support (D2) with the CLI.
- **Done:** `aws sts get-caller-identity` works via SSO; budget email received. **Cost:** ~0.

### Phase 1 — Terraform skeleton and remote state

- `infra/bootstrap/`: state bucket (versioned, SSE-S3, public access blocked, TLS-only policy). Applied once with
  local state, then left alone.
- `infra/envs/demo/`: providers (`ap-southeast-7` + `us-east-1` alias), backend `s3` with `use_lockfile = true`,
  `default_tags` (`project`, `env`, `managed-by=terraform`). Cost-relevant knobs are variables (`nat_type`,
  `task_count`, `use_spot`, `rds_multi_az`, `waf_enabled`, …) so production is a second `envs/` folder.
- `infra/modules/` stubs: `network`, `database`, `app`, `edge`, `cicd`.
- Tooling: pinned Terraform + AWS provider versions, `fmt`/`validate`, `tflint`, `trivy config` in a CI job `infra`.
- **Done:** `terraform plan` on an empty env runs clean. **Cost:** ~0.

### Phase 2 — Network (VPC)

- VPC `10.20.0.0/16`, DNS hostnames on, 2 AZs (ALB and RDS subnet groups need two).
- Subnets per AZ: public `/24`, private-app `/24`, private-db `/24`.
- IGW; route tables: public → IGW, private-app → local only, private-db → local only. **No NAT yet** (`nat_type = "none"`, Phase 9 adds it).
- S3 **gateway** endpoint (free).
- Security groups (rules by SG reference): `alb-sg` ← CloudFront VPC-origin SG on 80 · `api-sg` ← `alb-sg` on 4000,
  no other inbound · `db-sg` ← `api-sg`, `ops-task-sg` on 5432.
- No flow logs in the demo.
- **Done:** `plan` shows the layout; a test task in a public subnet reaches the internet, nothing reaches it
  inbound. **Cost:** ~0.

### Phase 3 — Database (RDS PostgreSQL 17)

- DB subnet group (db subnets), parameter group (`rds.force_ssl=1`, `log_min_duration_statement=500`).
- `db.t4g.micro`, single-AZ, gp3 20 GB, **no public access**, automated backups 1 day, encryption with the
  AWS-managed key, deletion protection on, final snapshot on destroy, Performance Insights off.
- SSM Parameter Store (`/movie/demo/...`, `SecureString`): master, `migrator`, `app_user` passwords and URLs
  (Terraform `random_password`), JWT / pepper / QR secrets (generated), Stripe keys (set by hand).
- One-off ECS task `db-bootstrap` (code change 2) creates roles + database, then privilege checks as `app_user`
  (DB-2).
- Code change 1 (TLS CA).
- **Done:** bootstrap task exits 0; privilege checks pass. **Cost:** ~USD 15 (0 asleep, storage ~USD 2.5).

### Phase 4 — Container platform (ECR + ECS Fargate + internal ALB)

- ECR repos `movie-api`, `movie-api-seed`: immutable tags (git SHA), basic scan on push, lifecycle keeps last 5.
- ECS cluster (Container Insights off), log groups with 7-day retention.
- IAM: **execution role** (pull ECR, read only `/movie/demo/*` parameters, write logs) and **task role** (empty).
- Task definitions (ARM64): `api` (0.25 vCPU / 0.5 GB, health check, `stopTimeout` > `SHUTDOWN_DRAIN_MS`, non-root),
  `migrate`, `seed`, `db-bootstrap`.
- Internal ALB in private-app subnets: HTTP 80 listener, target group `ip` type on 4000, health check
  `/api/v1/health/ready`, deregistration delay ≈ drain time.
- ECS service `api`: 1 task on **FARGATE_SPOT** (capacity provider with FARGATE fallback weight 0), public subnets,
  `assignPublicIp = true`, rolling 100/200 so a deploy starts the new task before stopping the old one,
  **deployment circuit breaker with rollback**. No autoscaling.
- EventBridge Scheduler: daily `seed` task (code change 3).
- `infra/scripts/sleep.sh` / `wake.sh` (AWS CLI): service desired 0 ↔ 1, `rds stop` ↔ `start`, scheduler
  disable ↔ enable. RDS restarts itself after 7 days stopped, so `sleep.sh` warns about it.
- First manual run: push image by hand, run `migrate`, `seed`, start service.
- **Done:** target healthy; `sleep.sh` then `wake.sh` brings the API back healthy. **Cost:** ALB ~USD 18, Fargate
  Spot ~USD 3, public IPv4 on the task ~USD 3.6.

### Phase 5 — Edge (S3 + OAC + CloudFront + WAF)

- S3 web bucket: private, Block Public Access, SSE-S3, bucket policy only for this distribution's OAC
  (`AWS:SourceArn`). No versioning in the demo (the build is reproducible from git).
- CloudFront (price class 200 covers Asia):
  - default behavior → S3 (OAC), `CachingOptimized`, CloudFront Function (viewer request) for the `.html` rewrite,
    custom error 404 → `/404.html`.
  - `/api/*` → **VPC origin** (internal ALB), `CachingDisabled`, origin request policy `AllViewerExceptHostHeader`,
    all methods.
  - response headers policy = nginx headers (CSP from `docker/nginx/default.conf.template`) + HSTS.
  - TLS 1.2_2021 minimum, HTTP/2+3. No access logs in the demo.
- WAF web ACL (`us-east-1`, CLOUDFRONT scope): AWS managed Common + Known Bad Inputs + IP reputation (all three
  free-to-use AWS rule groups), rate-based rule on `/api/v1/auth/*`. Exclude `/api/v1/payments/webhook` from
  body-inspection rules that could block Stripe payloads. The API's own rate limits stay on.
- **Done:** site loads at the public URL, `/th` deep links work after reload, `/api/v1/health/ready` → 200 via
  CloudFront, securityheaders.com grade A, direct S3 URL → 403, a SQL-injection probe gets a WAF 403.
  **Cost:** WAF ~USD 8 (USD 5 web ACL + USD 1 per rule, billed asleep too), CloudFront/S3 < USD 1.

### Phase 6 — CI/CD (GitHub Actions + OIDC)

- Prereq: push to the private GitHub repo; existing CI must go green first.
- `infra/modules/cicd`: GitHub OIDC provider; roles scoped by `sub` claim:
  `gh-infra-plan` (read-only, any PR), `gh-infra-apply` (`main` + `demo` environment), `gh-deploy` (ECR push,
  `ecs:RunTask` for migrate, `ecs:UpdateService`, `s3 sync` to the web bucket, `cloudfront:CreateInvalidation`,
  `iam:PassRole` only for the task roles).
- Workflows:
  - `infra.yml`: PR → `fmt`, `validate`, `tflint`, `trivy config`, `plan` as a PR comment. `main` → `apply` behind a
    GitHub Environment approval.
  - `deploy.yml` (manual `workflow_dispatch` + on `main` after CI; skips the API part when the stack is asleep):
    build ARM64 images → push SHA tags → run `migrate` task, wait, fail on non-zero → update `api` service, wait
    stable (circuit breaker rolls back) → build web → `s3 sync` (two cache classes, `--delete` after upload) →
    invalidate `/*`.
  - Migrations stay expand-only so the old task keeps working while the new one starts.
- **Done:** a commit on `main` reaches AWS with no laptop involved; a broken health check rolls back by itself.
  **Cost:** ~0 (GitHub Actions minutes; ARM runners or QEMU for the ARM64 build).

### Phase 7 — Payments and go-live checks

- Stripe test webhook → `https://<origin>/api/v1/payments/webhook` (three events, as in `deploy-aws.md` §6); keys in
  SSM; `PAYMENTS_PROVIDER=stripe`.
- Run the Playwright smoke subset against the public URL, plus manual: register → book → card + PromptPay test →
  ticket → cancel; two-tab refresh; seat race from two browsers. A Spot interruption during the demo = ~1 minute
  of 503 while ECS replaces the task; say so if it happens.
- **Restore drill:** restore the latest automated snapshot to a new instance and check data (PITR window is 1 day).
  **Rollback drill:** redeploy the previous image tag.
- **Done:** checklist signed off by the product owner. **Cost:** ~0.

### Phase 8 — Observability (light)

- CloudWatch alarms (free tier covers 10) → SNS email: ALB 5xx, unhealthy target, RDS free storage, WAF blocked spike, budget.
- Log Insights saved queries by `requestId`.
- Sentry free tier (web + API) with release = git SHA (WEB-7).
- `docs/runbook.md`: deploy, rollback, sleep / wake, rotate secrets, restore, `terraform destroy` + snapshot.
- **Done:** stopping the task sends an email within 5 minutes. **Cost:** ~0.

### Phase 9 — NAT and private tasks (later, product owner picks the date)

- `nat_type = "fck-nat"`: the open-source fck-nat AMI on a `t4g.nano` EC2 in public-a (~USD 3–4 with its public IP),
  in an Auto Scaling group of 1 so AWS replaces it if it dies, source/dest check off, its own SG (inbound from
  private-app only). Private-app route table `0.0.0.0/0` → its ENI. Terraform module `RaJiska/fck-nat` (pin version).
- Move the `api` service and one-off tasks to **private-app subnets**, `assignPublicIp = false`. The task loses its
  public IPv4 fee (~USD 3.6), so the NAT is almost cost-neutral.
- RDS does not change: it never calls out, so it never uses the NAT.
- Trade-off vs managed NAT gateway: one instance in one AZ, ~1–2 min outage while the ASG replaces it, lower
  bandwidth, we patch the AMI. Fine for a demo; `nat_type = "gateway"` when that stops being fine.
- `sleep.sh` / `wake.sh` also scale the NAT ASG to 0 / 1.
- **Done:** task in private-app reaches Stripe through the NAT; it has no public IP; nothing inbound reaches it.
  **Cost:** +USD 3–4 awake, −USD 3.6 task IPv4.

## 6. Running total (approximate)

| Item                                | Awake, USD / month | Asleep, USD / month |
| ----------------------------------- | ------------------ | ------------------- |
| ALB (internal)                      | 18                 | 18                  |
| RDS `db.t4g.micro` + 20 GB          | 15                 | 2.5                 |
| Fargate Spot 0.25 vCPU / 0.5 GB × 1 | 3                  | 0                   |
| Public IPv4 on the task             | 3.6                | 0                   |
| WAF (web ACL + 4 rules)             | 8–9                | 8–9                 |
| CloudFront, S3, ECR, logs, SSM      | 1–2                | < 1                 |
| **Total**                           | **~49**            | **~30**             |
| + Phase 9 fck-nat (later)           | +3–4               | +0 (stopped)        |

`terraform destroy` (after a final snapshot; keep the state bucket, ECR and web bucket) drops it to ~USD 1/month;
`apply` + `wake.sh` rebuilds in ~20 minutes. Demoing a few days a month with destroy in between: a few dollars.

## 7. Repo layout after Phase 6

```
infra/
  bootstrap/            state bucket (local state, applied once)
  envs/demo/            main.tf, variables.tf, terraform.tfvars (no secrets), backend.tf
  modules/network/      VPC, subnets, NAT (none | fck-nat | gateway), S3 endpoint, SGs
  modules/database/     RDS, parameter group, SSM parameters
  modules/app/          ECR, ECS cluster/tasks/service, ALB, scheduler
  modules/edge/         S3, OAC, CloudFront, function, headers policy, WAF, optional ACM / Route 53
  modules/cicd/         GitHub OIDC provider + roles
  scripts/              db-bootstrap.sh, sleep.sh, wake.sh
.github/workflows/      ci.yml (exists), infra.yml, deploy.yml
docs/runbook.md
```

## 8. Later: switch to production (not now)

Each line is a variable or a small module change in a new `envs/prod/`:

- `nat_type = "gateway"` (managed NAT, ~USD 45) if fck-nat (Phase 9) is not enough.
- 2+ on-demand tasks at 0.5 vCPU / 1 GB across AZs, autoscaling on CPU.
- RDS: 7-day backups, Multi-AZ, Performance Insights, Secrets Manager with rotation, customer KMS key.
- Bot Control / more WAF rules, CloudFront + VPC flow logs, Container Insights, more alarms and a dashboard.
- Domain + ACM, S3 versioning, Redis for shared rate limits, OpenTelemetry, SES email (plan.md backlog).

## 9. Decisions log (infra)

| #   | Date       | Decision                                                                                                       |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| I1  | 2026-10-30 | Plan written. D1 Terraform, D2 Bangkok, D3 cloudfront.net, D4 no demo user, D5 Stripe test.                    |
| I2  | 2026-10-30 | D6 demo-cheap profile (no NAT, 1 Spot task in public subnets, internal ALB, SSM, no WAF), D7 sleep / destroy.  |
| I3  | 2026-10-30 | WAF kept (Phase 5). NAT deferred to Phase 9, fck-nat first, managed NAT gateway only if needed. Budget USD 50. |
