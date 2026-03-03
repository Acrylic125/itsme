terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5"
    }
  }
}

resource "cloudflare_d1_database" "itsme-database" {
  account_id = var.account_id
  name       = "itsme"
  read_replication = {
    mode = "disabled"
  }
}

resource "cloudflare_r2_bucket" "itsme-bucket" {
  account_id = var.account_id
  name       = "itsme-bucket"
}
