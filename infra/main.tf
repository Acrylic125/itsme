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

resource "cloudflare_account_token" "itsme-account-token" {
  account_id = "cea74c56c18a082fab52ca288c594c10"
  name       = "dev"

  policies = [{
    effect = "allow"
    permission_groups = [{
      id = "09b2857d1c31407795e75e3fed8617a1"
    }]
    resources = jsonencode({
      "com.cloudflare.api.account.cea74c56c18a082fab52ca288c594c10" = "*"
    })
    }, {
    effect = "allow"
    permission_groups = [{
      id = "bf7481a1826f439697cb59a20b22293e"
    }]
    resources = jsonencode({
      "com.cloudflare.api.account.cea74c56c18a082fab52ca288c594c10" = "*"
    })
    }, {
    effect = "allow"
    permission_groups = [{
      id = "644535f4ed854494a59cb289d634b257"
      }, {
      id = "6c8a3737f07f46369c1ea1f22138daaf"
      }, {
      id = "bacc64e0f6c34fc0883a1223f938a104"
    }]
    resources = jsonencode({
      "com.cloudflare.api.account.cea74c56c18a082fab52ca288c594c10" = "*"
    })
  }]

  # condition = {
  #   request_ip = {
  #     in = ["115.66.83.164/32"]
  #   }
  # }

  expires_on = "2027-04-18T23:59:59Z"
}
