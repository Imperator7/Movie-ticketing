# infra/ — AWS demo environment

Terraform and scripts for the layout in [`plan-infra.md`](../plan-infra.md). Each phase is written and committed by
the lead; **the product owner applies it** and reports back the output asked for at the end of the phase.

| Phase | What                                   | Applied by you | Status  |
| ----- | -------------------------------------- | -------------- | ------- |
| 0     | Prerequisites (region, budget, CLI)    | ☐              | written |
| 1     | Terraform skeleton on the remote state | ☐              | written |
| 2     | Network (VPC)                          | ☐              | –       |
| 3     | Database (RDS)                         | ☐              | –       |
| 4     | Container platform (ECR, ECS, ALB)     | ☐              | –       |
| 5     | Edge (S3, OAC, CloudFront, WAF)        | ☐              | –       |
| 6     | CI/CD (GitHub OIDC)                    | ☐              | –       |
| 7     | Payments and go-live checks            | ☐              | –       |
| 8     | Observability (light)                  | ☐              | –       |
| 9     | NAT (fck-nat), later                   | ☐              | –       |

Conventions: region `ap-southeast-7`, edge resources (WAF, ACM) in `us-east-1`, every resource tagged
`project=movie-ticketing`, `env=demo`, `managed-by=terraform`. State lives in your **existing** state bucket (the one
with the portfolio state) under the key `movie-ticketing/demo/terraform.tfstate`. Credentials come from your AWS CLI
profile (`AWS_PROFILE`), never from the code.

---

## Phase 0 — Prerequisites (console, ~10 minutes)

Only what Terraform needs to run. Account hardening (root MFA, SSO instead of IAM user keys, CloudTrail, Access
Analyzer) is recommended but can wait.

1. **Enable Bangkok.** Account menu → **Account** → **AWS Regions** → **Asia Pacific (Thailand) `ap-southeast-7`**
   → Enable. It's an opt-in region: nothing works there until this finishes (minutes, sometimes hours).
2. **Budget.** Billing and Cost Management → **Budgets** → Cost budget, monthly **USD 50**, email alerts at actual
   50 / 80 / 100 % and forecasted 100 %.
3. **Permissions for your CLI user.** The `default` profile is the IAM user `tf-learning`. The coming phases create
   VPC, EC2, RDS, ECS, ECR, ELB, IAM roles, SSM parameters, S3, CloudFront and WAF resources, so that user needs
   broad rights (for a demo account: attach `AdministratorAccess`) or use an SSO admin profile instead. Today it
   can't even run `s3:ListAllMyBuckets`.
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
