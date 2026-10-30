# infra/ — AWS demo environment

Terraform and scripts for the layout in [`plan-infra.md`](../plan-infra.md). Each phase is written and committed by
the lead; **the product owner applies it** and reports back the output asked for at the end of the phase.

| Phase | What                                | Applied by you | Status  |
| ----- | ----------------------------------- | -------------- | ------- |
| 0     | Account and guardrails (console)    | ☐              | written |
| 1     | Terraform skeleton and remote state | ☐              | –       |
| 2     | Network (VPC)                       | ☐              | –       |
| 3     | Database (RDS)                      | ☐              | –       |
| 4     | Container platform (ECR, ECS, ALB)  | ☐              | –       |
| 5     | Edge (S3, OAC, CloudFront, WAF)     | ☐              | –       |
| 6     | CI/CD (GitHub OIDC)                 | ☐              | –       |
| 7     | Payments and go-live checks         | ☐              | –       |
| 8     | Observability (light)               | ☐              | –       |
| 9     | NAT (fck-nat), later                | ☐              | –       |

Conventions: region `ap-southeast-7`, edge resources (WAF, ACM) in `us-east-1`, AWS CLI profile `movie-demo`,
every resource tagged `project=movie-ticketing`, `env=demo`, `managed-by=terraform`.

---

## Phase 0 — Account and guardrails (you, console, ~1 hour)

Nothing here costs money. Do the steps in order. Sign in as the **root user** only for steps 1–3.

### 1. Lock down the root user

1. Console (top right) → **Security credentials**.
2. **Multi-factor authentication** → Assign MFA device (passkey or authenticator app).
3. **Access keys**: there should be none for root. If one exists, deactivate it, then delete it.

### 2. Turn on the Bangkok region (opt-in region)

1. Account menu → **Account** → **AWS Regions**.
2. Find **Asia Pacific (Thailand) `ap-southeast-7`** → **Enable**. It can take a few minutes up to a few hours.

### 3. Budget and billing alerts

1. **Billing and Cost Management** → **Budgets** → Create budget → **Cost budget**, monthly, **USD 50**.
2. Alerts: actual cost at **50 %, 80 %, 100 %**, and forecasted cost at **100 %**, to your email.
3. **Billing preferences**: turn on **Free Tier usage alerts** and **CloudWatch billing alerts**.
4. **Credits** and **Free Tier** pages: note what the account has (new-account credits can cover most of the demo).
5. **Cost Explorer**: open it once so it starts collecting (free).

### 4. Admin user through IAM Identity Center (no long-lived keys)

1. **IAM Identity Center** → Enable (pick `ap-southeast-7` if offered, otherwise `ap-southeast-1`; note which).
2. **Users** → Add user (your name and email) → accept the invite email, set a password and MFA.
3. **Permission sets** → Create → predefined **AdministratorAccess**, session duration **4 hours**.
4. **AWS accounts** → select this account → Assign users → your user + `AdministratorAccess`.
5. Note the **AWS access portal URL** (`https://d-xxxxxxxxxx.awsapps.com/start`).
6. On your Mac:

   ```bash
   aws configure sso --profile movie-demo
   ```

   SSO session name `movie`, start URL = the portal URL, SSO region = the region from step 1, scopes default,
   default region **`ap-southeast-7`**, output `json`.

7. Test it:

   ```bash
   aws sso login --profile movie-demo
   ```

   ```bash
   aws sts get-caller-identity --profile movie-demo
   ```

   The `Arn` should contain `AWSReservedSSO_AdministratorAccess`.

8. `~/.aws/credentials` already exists on this Mac. If it holds access keys for an IAM user in this account, the plan
   doesn't need them any more. Deactivate them in IAM (not delete, until you're sure nothing else uses them).

From now on, sign in through the access portal, not as root.

### 5. Account-wide safety switches

1. **CloudTrail** → Create trail `movie-account-trail`, management events only, new S3 bucket, SSE-S3 (the
   first trail with management events is free; S3 storage costs cents).
2. **IAM** → **Access analyzer** → Create analyzer, type **external access**, zone of trust = this account (free).
3. **S3** → **Block Public Access settings for this account** → turn **all four** on. (The web bucket uses OAC, so it
   never needs public access.)

### 6. Check Bangkok supports what the plan uses

```bash
AWS_PROFILE=movie-demo bash infra/scripts/check-region.sh
```

Every line should say `OK`. Send me the output (it has no secrets).

### Phase 0 is done when

- [ ] Root has MFA and no access keys.
- [ ] `ap-southeast-7` is enabled.
- [ ] Budget alert email arrived (AWS sends a confirmation).
- [ ] `aws sts get-caller-identity --profile movie-demo` shows the SSO admin role.
- [ ] CloudTrail, Access Analyzer and S3 account Block Public Access are on.
- [ ] `check-region.sh` output sent to the lead.
