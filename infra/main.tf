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

# Add your own token.
# resource "cloudflare_account_token" "itsme-account-token" {
#   account_id = var.account_id
#   name       = "prod"

#   policies = [{
#     effect = "allow"
#     permission_groups = [{
#       id = "192192df92ee43ac90f2aeeffce67e35"
#       }, {
#       id = "09b2857d1c31407795e75e3fed8617a1"
#       }, {
#       id = "b4992e1108244f5d8bfbd5744320c2e1"
#       }, {
#       id = "bf7481a1826f439697cb59a20b22293e"
#       }, {
#       id = "bacc64e0f6c34fc0883a1223f938a104"
#       }, {
#       id = "a92d2450e05d4e7bb7d0a64968f83d11"
#       }, {
#       id = "eb56a6953c034b9d97dd838155666f06"
#       }, {
#       id = "5bc3f8b21c554832afc660159ab75fa4"
#     }]
#     resources = jsonencode({
#       "com.cloudflare.api.account.cea74c56c18a082fab52ca288c594c10" = "*"
#     })
#   }]

#   condition = {
#     request_ip = {
#       in = [
#       // TODO: Add IP ranges
#       ]
#     }
#   }
# }
