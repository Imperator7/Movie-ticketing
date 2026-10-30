# Infra handoff (2026-10-30)

Context for a new Claude session continuing the AWS demo work. Read this, then `plan-infra.md` and
`infra/README.md`.

## How we work (product owner's rules)

- **One Terraform file at a time.** Write it, explain it in plain simple English (short, no jargon dumps), say where
  we are ("Phase 2, file 2 of 2"), and wait for the product owner to check it.
- **The product owner runs `terraform apply` themselves.** Claude never applies.
- Keep it simple, like their portfolio project. Don't add extra machinery (no bootstrap buckets, no backend.hcl).
- It's a **demo**: cheapest options; upgrades come later.

## Decisions

- Region `ap-southeast-7` (Bangkok). WAF/ACM for CloudFront in `us-east-1`.
- State: existing bucket `state-bucket-portfolio-project` (`ap-southeast-7`), key
  `movie-ticketing/demo/terraform.tfstate` (inline in `infra/envs/demo/versions.tf`).
- AWS CLI user: IAM user `tf-learning` (account 703705584185), `AdministratorAccess` (re-attached 2026-10-30; it
  was missing). Temporary: switch to IAM Identity Center (SSO) and delete its access key later.
- Layout: S3 + OAC + CloudFront + **WAF** (kept) → `/api/*` via CloudFront VPC origin → **internal ALB** →
  1 ECS Fargate Spot task (0.25 vCPU / 0.5 GB, ARM64) → RDS PostgreSQL 17 `db.t4g.micro` single-AZ.
- **Everything runs in one zone (zone a).** App and db subnets also exist in zone b, empty, only because AWS requires
  2 zones for an ALB and for an RDS subnet group (free). Public subnet: zone a only.
- **No NAT yet**: the API task sits in the public subnet with a public IP (inbound allowed only from the ALB).
  NAT comes later as fck-nat on a `t4g.nano` (Phase 9).
- SSM Parameter Store for secrets (free). Stripe test mode, no demo account on AWS. Free `*.cloudfront.net` URL.
- Cost estimate ~USD 49/month awake, ~30 asleep. Budget alarm USD 50.

## Status

- ✅ Phase 0: Bangkok enabled, budget, `tf-learning` admin.
- ✅ Phase 1 applied: `infra/envs/demo` (versions, providers, variables, main, outputs) on the remote state.
- ✅ Phase 2 applied (2026-10-30): `network.tf` (VPC 10.20.0.0/16, public 10.20.0.0/24 zone a, app 10.20.10.0/24 +
  10.20.11.0/24, db 10.20.20.0/24 + 10.20.21.0/24, IGW, route tables, S3 gateway endpoint) and `security-groups.tf`
  (`alb` → `api` on 4000 · `api` ← `alb` · `db` ← `api` and `ops` on 5432 · `api`/`ops` out on 443 · default SG
  emptied). **The ALB has no inbound rule yet**: CloudFront's VPC-origin SG only exists after Phase 5 creates the
  VPC origin, so Phase 5 adds `alb` ← that SG on 80.
- ✅ Phase 3 applied (2026-10-30): `database.tf` (RDS PostgreSQL 17 `db.t4g.micro`, zone a, gp3 20 GB, private,
  `rds.force_ssl`, 1-day backups, deletion protection, final snapshot) and `secrets.tf` (`random_password` →
  SSM `SecureString` under `/movie/demo/...`: db master / migrator / app_user passwords, `api/database-url`,
  `api/migration-database-url`, JWT / pepper / QR secrets). The database is **empty** until Phase 4 runs the
  db-bootstrap task (roles + `movie_ticketing`; moved from Phase 3 because it needs ECS).
- 🟡 Phase 4 in 3 steps: (1) `ecr.tf` + `infra/scripts/push-images.sh` (ARM64 images tagged with the git commit;
  the API Dockerfile now bundles the RDS CA at `/app/certs/rds-global-bundle.pem`), (2) `ecs.tf`: cluster, logs,
  IAM roles, task definitions api / migrate / seed / db-bootstrap, run bootstrap → migrate → seed, (3) `alb.tf` +
  service + daily seed schedule + sleep/wake scripts.
- TLS in the URLs: node-postgres (API, seed) uses `sslmode=verify-full&sslrootcert=…`; Prisma Migrate's engine
  doesn't know `verify-full`, so the migration URL uses `sslmode=require&sslcert=…&sslaccept=strict`.
- **Product owner, 2026-10-30: focus = hosted on AWS + GitHub Actions deploys.** Payments stay `fake` (demo pay
  button, public in the demo is accepted for now; overrides D5 until Stripe keys exist). Stripe (Phase 7) and
  observability (Phase 8) come later, when the product owner asks. Order now: Phase 4 steps 2–3 → Phase 5 (edge)
  → Phase 6 (GitHub Actions, needs the repo on GitHub).
- Phase 4 step 2 written: `ecs.tf` (cluster, Spot capacity, 7-day logs, execution role reading only `/movie/demo/*`,
  empty task role, task definitions db-bootstrap / migrate / seed / api pinned to the newest ECR image digest),
  `infra/scripts/db-bootstrap.sh` (sent as the command of a `postgres:17-alpine` task) and
  `infra/scripts/run-task.sh` (run a one-off task, wait, print logs and exit code).

## On a new machine

The default AWS CLI profile may be another user (on the Windows machine it is `aws-portfolio`, which can't run
this). Use the `movie-demo` profile (`tf-learning` keys) in the shell that runs Terraform:

```bash
git switch feat/infra-demo
export AWS_PROFILE=movie-demo   # PowerShell: $env:AWS_PROFILE = "movie-demo"
aws sts get-caller-identity     # must say user/tf-learning
cd infra/envs/demo && terraform init
```
