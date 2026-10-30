# Phase 5: the public front door. CloudFront gives one HTTPS address (https://dxxxx.cloudfront.net) for everything:
#
#   /*       → S3 bucket (the website's static files, private: only CloudFront may read them)
#   /api/*   → the internal ALB, reached privately through a CloudFront "VPC origin" → API task
#
# Same address for site and API = no CORS, and the login cookie stays first-party. This replaces what nginx did in
# docker compose (apps/web/Dockerfile, docker/nginx/default.conf.template).

# ---- S3 bucket for the website -----------------------------------------------------------------------------------

resource "aws_s3_bucket" "web" {
  bucket        = "${local.name}-web-${data.aws_caller_identity.current.account_id}" # bucket names are global
  force_destroy = true                                                               # demo: destroy even if not empty
}

# Fully private: no public access of any kind. CloudFront reads it with signed requests (OAC, below).
resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id
  rule {
    object_ownership = "BucketOwnerEnforced" # no ACLs; the bucket policy decides everything
  }
}

# OAC = CloudFront signs its requests to S3, so the bucket can trust exactly this distribution.
resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name}-web"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.main.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket     = aws_s3_bucket.web.id
  policy     = data.aws_iam_policy_document.web_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.web]
}

# ---- Private path to the ALB -------------------------------------------------------------------------------------

# CloudFront places its own network interfaces inside our VPC to reach the internal ALB. Creating it takes ~10 min.
resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${local.name}-alb"
    arn                    = aws_lb.api.arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only" # inside AWS's network; visitors still get HTTPS from CloudFront

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
}

# AWS creates this security group in our VPC together with the VPC origin. It is what CloudFront's interfaces use.
data "aws_security_group" "cloudfront_vpc_origin" {
  vpc_id = aws_vpc.main.id
  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG"]
  }
  depends_on = [aws_cloudfront_vpc_origin.alb]
}

# The rule left out in Phase 2: the ALB finally accepts traffic, from CloudFront only.
resource "aws_vpc_security_group_ingress_rule" "alb_from_cloudfront" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origin.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "CloudFront VPC origin"
}

# ---- Behaviour pieces --------------------------------------------------------------------------------------------

# The static export writes /th/movies.html; visitors ask for /th/movies. nginx did `try_files $uri $uri.html`.
resource "aws_cloudfront_function" "html_rewrite" {
  name    = "${local.name}-html-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "/x -> /x.html, /dir/ -> /dir/index.html"
  publish = true
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      var uri = request.uri;
      if (uri.endsWith("/")) {
        request.uri = uri + "index.html";
      } else if (uri.split("/").pop().indexOf(".") === -1) {
        request.uri = uri + ".html";
      }
      return request;
    }
  JS
}

# Security headers on every response (WEB-2, WEB-3), the same ones nginx sent.
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "${local.name}-security-headers"

  security_headers_config {
    content_security_policy {
      override = true
      # Next's static export uses inline bootstrap scripts, hence 'unsafe-inline'. Stripe for later; TMDB posters.
      content_security_policy = join("; ", [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://js.stripe.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://image.tmdb.org https://*.stripe.com",
        "font-src 'self'",
        "connect-src 'self' https://api.stripe.com",
        "frame-src https://js.stripe.com https://hooks.stripe.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ])
    }
    content_type_options {
      override = true
    }
    frame_options {
      override     = true
      frame_option = "DENY"
    }
    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }
    # Browsers remember to use HTTPS only (1 year).
    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = true
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "camera=(), microphone=(), geolocation=(), payment=(self \"https://js.stripe.com\")"
      override = true
    }
  }
}

# AWS's ready-made policies.
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized" # follows each file's Cache-Control (deploy-web.sh sets it)
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled" # API answers are never cached
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader" # pass cookies, query, Origin, etc. to the API
}

# ---- The distribution --------------------------------------------------------------------------------------------

resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  comment             = local.name
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = "PriceClass_200" # includes Asia (Bangkok edge); skips the priciest regions
  web_acl_id          = aws_wafv2_web_acl.main.arn

  origin {
    origin_id                = "web"
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  origin {
    origin_id   = "api"
    domain_name = aws_lb.api.dns_name
    vpc_origin_config {
      vpc_origin_id = aws_cloudfront_vpc_origin.alb.id
    }
  }

  # Everything that isn't /api/*: the website from S3.
  default_cache_behavior {
    target_origin_id           = "web"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.html_rewrite.arn
    }
  }

  # The API: every method, nothing cached, cookies and headers passed through.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = "api"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # The free *.cloudfront.net certificate. A custom domain comes later.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = { Name = local.name }
}
