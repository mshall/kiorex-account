variable "cloudfront_targets" {
  type = map(object({
    domain_name = string
    zone_id     = string
  }))
  default = {}
}

variable "apprunner_domains" {
  type    = map(string)
  default = {}
}
