# infra/ — AWS demo environment

Terraform and scripts for the layout in [`plan-infra.md`](../plan-infra.md). Each phase is written and committed by
the lead; **the product owner applies it** and reports back the output asked for at the end of the phase.

> **Status 2026-11-10: parked, not running.** Phases 0–6 were applied in the first AWS account (live 2026-10-30,
> last deploy 2026-11-06). The product owner has since moved to a new account with IAM Identity Center (SSO), and
> the old demo URL no longer resolves. The new account has none of this yet. Work continues on the local Docker
> stack (`npm run stack:up`); the move to AWS comes later and this Terraform will need changes. Before the first
> `terraform init` in the new account:
>
> 1. The backend in `versions.tf` names the bucket `state-bucket-portfolio-project`, which lives in the **old**
>    account (the SSO role gets 403). Create a state bucket in the new account and put its name there.
> 2. Redo Phase 0 in the new account (enable Bangkok, budget).
> 3. `github.tf` expects the account's GitHub OIDC provider to exist already.
> 4. After the apply, copy the `github_actions_variables` output into the GitHub repo variables again (they still
>    hold the old account's ids), then put the `workflow_run` trigger back in `.github/workflows/deploy.yml`.

| Phase | What                                   | Old account | New account |
| ----- | -------------------------------------- | ----------- | ----------- |
| 0     | Prerequisites (region, budget, CLI)    | done        | –           |
| 1     | Terraform skeleton on the remote state | applied     | –           |
| 2     | Network (VPC)                          | applied     | –           |
| 3     | Database (RDS)                         | applied     | –           |
| 4     | Container platform (ECR, ECS, ALB)     | applied     | –           |
| 5     | Edge (S3, OAC, CloudFront, WAF)        | applied     | –           |
| 6     | CI/CD (GitHub OIDC)                    | applied     | –           |
| 7     | Payments and go-live checks            | –           | –           |
| 8     | Observability (light)                  | –           | –           |
| 9     | NAT (fck-nat), later                   | –           | –           |

Conventions: region `ap-southeast-7`, edge resources (WAF, ACM) in `us-east-1`, every resource tagged
`project=movie-ticketing`, `env=demo`, `managed-by=terraform`. State lives in an S3 bucket under the key
`movie-ticketing/demo/terraform.tfstate`. Credentials come from your AWS CLI SSO profile
(`aws sso login --profile <name>`, then `export AWS_PROFILE=<name>`), never from the code and never from IAM user keys.

---

## Phase 0 — Prerequisites (console, ~10 minutes)

Only what Terraform needs to run. Account hardening (root MFA, SSO instead of IAM user keys, CloudTrail, Access
Analyzer) is recommended but can wait.

1. **Enable Bangkok.** Account menu → **Account** → **AWS Regions** → **Asia Pacific (Thailand) `ap-southeast-7`**
   → Enable. It's an opt-in region: nothing works there until this finishes (minutes, sometimes hours).
2. **Budget.** Billing and Cost Management → **Budgets** → Cost budget, monthly **USD 50**, email alerts at actual
   50 / 80 / 100 % and forecasted 100 %.
3. **Permissions for your CLI.** Use an IAM Identity Center (SSO) profile, not an IAM user with access keys. The
   phases create VPC, EC2, RDS, ECS, ECR, ELB, IAM roles, SSM parameters, S3, CloudFront and WAF resources, so the
   role needs broad rights (for a demo account: the `AdministratorAccess` permission set). Check who you are with
   `aws sts get-caller-identity`.
4. **Check Bangkok supports the plan** (read-only, creates nothing):

   ```bash
   bash infra/scripts/check-region.sh
   ```

   Every line should say `OK`.

## Phase 1 — Terraform skeleton on the remote state

Creates **nothing** in AWS. It connects `infra/envs/demo` to your state bucket and proves both providers
(`ap-southeast-7` and `us-east-1`) can authenticate.

1. The backend is in `versions.tf`: bucket `state-bucket-portfolio-project`, region `ap-southeast-7`, key
   `movie-ticketing/demo/terraform.tfstate` (the portfolio uses a different key, so its state is untouched).

2. Initialise:

   ```bash
   cd infra/envs/demo && terraform init
   ```

3. Plan and apply (no resources, only reads your account id and the Bangkok AZs, and writes the first state file):

   ```bash
   terraform plan
   ```

   ```bash
   terraform apply
   ```

4. Check the state file landed next to the portfolio one, under its own key:

   ```bash
   aws s3 ls s3://<your-bucket>/movie-ticketing/demo/
   ```

   (Needs `s3:ListBucket` on that bucket; skip if the user can't list.)

**Phase 1 is done when** `terraform apply` prints `account_id` and three Bangkok AZs, and the portfolio state is
untouched. Send me the `apply` output (no secrets in it).

Lock file note: the S3 backend writes `movie-ticketing/demo/terraform.tfstate.tflock` while a command runs
(`use_lockfile = true`). If the portfolio still uses a DynamoDB lock table, that's fine: the two projects have
separate keys and don't share locks.
