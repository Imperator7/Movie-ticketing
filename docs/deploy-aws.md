# Deploy to AWS (fast path: one EC2 + CloudFront)

The quickest way to get a public HTTPS URL tonight. The whole Docker Compose stack (Postgres, API, nginx + web) runs
on **one EC2 instance**, and **CloudFront** in front gives HTTPS and a `*.cloudfront.net` URL (or `movies.rungroj.dev`).
The production-grade layout from plan.md (S3 + CloudFront for the web, ECS Fargate + ALB + RDS, Terraform) comes
after; this file is the stepping stone.

```
Browser --https--> CloudFront --http:80--> EC2 [ nginx(web) -> api -> postgres ]
```

Cost: a `t3.small` is about USD 0.02/hour plus a 20 GB gp3 volume. Stop or terminate it when you're done showing it.

## 1. Launch the instance (console, ~5 min)

EC2 → Launch instance:

- **Name** `movie-ticketing`, **AMI** Amazon Linux 2023 (x86_64), **type** `t3.small` (2 GB RAM; the build needs it).
- **Key pair**: your existing one (or create one).
- **Security group** `movie-ticketing-sg`: inbound **SSH 22 from My IP** and **HTTP 80 from the CloudFront prefix list**
  (Source → Prefix lists → `com.amazonaws.global.cloudfront.origin-facing`). Nothing else.
- **Storage** 20 GB gp3.

## 2. Install Docker (on the instance)

```bash
ssh -i ~/.ssh/<key>.pem ec2-user@<public-ip>

sudo dnf install -y docker git
sudo systemctl enable --now docker
sudo usermod -aG docker ec2-user
sudo mkdir -p /usr/libexec/docker/cli-plugins
sudo curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/libexec/docker/cli-plugins/docker-compose
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-compose
BX=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/docker/buildx/releases/latest | sed 's#.*/##')
sudo curl -fsSL "https://github.com/docker/buildx/releases/download/${BX}/buildx-${BX}.linux-amd64" \
  -o /usr/libexec/docker/cli-plugins/docker-buildx
sudo chmod +x /usr/libexec/docker/cli-plugins/docker-buildx
# 2 GB swap so the Next.js build can't run out of memory
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
exit   # log out and back in so the docker group applies
```

## 3. Copy the code (from your Mac)

The repo isn't on GitHub yet, so send a git bundle:

```bash
cd ~/Desktop/"Movie ticketing"
git bundle create /tmp/mt.bundle main
scp -i ~/.ssh/<key>.pem /tmp/mt.bundle ec2-user@<public-ip>:~
ssh -i ~/.ssh/<key>.pem ec2-user@<public-ip> 'git clone -b main mt.bundle movie-ticketing'
```

(Once the repo is on GitHub: `git clone` it instead, and `git pull` to update.)

## 4. Create CloudFront first (you need its URL for the config)

CloudFront → Create distribution:

- **Origin domain**: the instance's **Public IPv4 DNS** (`ec2-…compute.amazonaws.com`), **HTTP only**, port 80.
- **Viewer protocol policy**: Redirect HTTP to HTTPS. **Allowed methods**: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE.
- **Default behavior cache policy**: `CachingOptimized`, origin request policy: none.
- **Add a second behavior** for path `/api/*`: same origin, methods all, cache policy **`CachingDisabled`**, origin
  request policy **`AllViewerExceptHostHeader`** (forwards cookies, `Authorization`, `Origin`, query strings).
- **WAF**: off for now (or the free "basic protections").

Wait for "Deployed" and note `https://dxxxx.cloudfront.net`.

## 5. Configure and start (on the instance)

```bash
cd ~/movie-ticketing
cp .env.example .env
# Real passwords for the database roles (the example ones are for local dev only):
sed -i "s/^POSTGRES_SUPERUSER_PASSWORD=.*/POSTGRES_SUPERUSER_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^MIGRATOR_PASSWORD=.*/MIGRATOR_PASSWORD=$(openssl rand -hex 24)/" .env
sed -i "s/^APP_USER_PASSWORD=.*/APP_USER_PASSWORD=$(openssl rand -hex 24)/" .env
cat >> .env <<'EOF'
PUBLIC_ORIGIN=https://dxxxx.cloudfront.net
TRUST_PROXY_HOPS=2
WEB_BIND=0.0.0.0
WEB_HOST_PORT=80
EOF
bash scripts/stack-secrets.sh
docker compose --profile stack up -d --build      # first build takes ~5-10 min on a t3.small
docker compose --profile stack ps                 # api: healthy, web: running, migrate/seed: exited (0)
curl -s localhost/api/v1/health/ready
```

Open `https://dxxxx.cloudfront.net` → it redirects to `/th`. Log in with `demo@example.com` / `demo-password-123`.

## 6. Stripe test mode (optional)

Stripe dashboard (test mode) → Developers → Webhooks → Add endpoint
`https://dxxxx.cloudfront.net/api/v1/payments/webhook`, events `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`. Then in `.env`:

```bash
PAYMENTS_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from that endpoint's page
```

`docker compose --profile stack up -d` restarts the API with Stripe. No web rebuild: the checkout reads the
publishable key from the API.

## Update after code changes

```bash
# Mac
git bundle create /tmp/mt.bundle main && scp -i ~/.ssh/<key>.pem /tmp/mt.bundle ec2-user@<ip>:~
# EC2
cd ~/movie-ticketing && git pull ~/mt.bundle main && docker compose --profile stack up -d --build
```

Then CloudFront → Invalidations → `/*` so the new HTML is served right away.

## Known limits of this fast path (fix in the production phase)

- Postgres lives on the instance's disk: no backups, gone with the instance (RDS + snapshots later).
- One instance, no autoscaling or zero-downtime deploys (ECS Fargate + ALB later).
- CloudFront → EC2 is plain HTTP inside AWS's network, and the security group only admits CloudFront.
- The seed creates the public demo account; the fake payment provider confirms bookings without money.
