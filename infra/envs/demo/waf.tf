# Phase 5: WAF, a filter in front of CloudFront that blocks known-bad traffic before it reaches the app.
# CloudFront's WAF must live in us-east-1 (provider alias). Cost: ~USD 5/month + USD 1 per rule (3) + requests.
#
#   1. AWS IP reputation list  : addresses AWS has seen attacking (bots, scanners)
#   2. AWS common rule set     : common attacks (bad headers, path tricks, XSS patterns, ...)
#   3. Rate limit              : one IP sending more than 2000 requests in 5 minutes is blocked for a while

locals {
  waf_visibility = {
    cloudwatch_metrics_enabled = true # free metrics in CloudWatch
    sampled_requests_enabled   = true # see examples of blocked requests in the console
  }
}

resource "aws_wafv2_web_acl" "main" {
  provider = aws.us_east_1
  name     = local.name
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "aws-ip-reputation"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      metric_name                = "aws-ip-reputation"
      cloudwatch_metrics_enabled = local.waf_visibility.cloudwatch_metrics_enabled
      sampled_requests_enabled   = local.waf_visibility.sampled_requests_enabled
    }
  }

  rule {
    name     = "aws-common"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        # This rule blocks request bodies over 8 KB. Our requests are small, but Stripe webhooks (later) can be
        # bigger, so it only counts instead of blocking. The API has its own body limit.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      metric_name                = "aws-common"
      cloudwatch_metrics_enabled = local.waf_visibility.cloudwatch_metrics_enabled
      sampled_requests_enabled   = local.waf_visibility.sampled_requests_enabled
    }
  }

  rule {
    name     = "rate-limit"
    priority = 2
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 2000 # requests per IP per 5 minutes (a page load is ~30 requests)
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      metric_name                = "rate-limit"
      cloudwatch_metrics_enabled = local.waf_visibility.cloudwatch_metrics_enabled
      sampled_requests_enabled   = local.waf_visibility.sampled_requests_enabled
    }
  }

  visibility_config {
    metric_name                = local.name
    cloudwatch_metrics_enabled = local.waf_visibility.cloudwatch_metrics_enabled
    sampled_requests_enabled   = local.waf_visibility.sampled_requests_enabled
  }
}
