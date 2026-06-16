#!/usr/bin/env bash
# Run once before first `terraform init` to create the remote state storage
# account and a service principal for CI.
#
# Usage:
#   chmod +x infra/bootstrap.sh
#   ./infra/bootstrap.sh
#
# Requires: az CLI logged in, jq

set -euo pipefail

SUBSCRIPTION_ID="e1289da2-5faa-44b8-b780-7609260fa273"
LOCATION="uksouth"
STATE_RG="rg-terraform-state"    # already exists — will not be recreated
STATE_SA="tfstateastroazureswa"  # globally unique, max 24 alphanumeric chars
STATE_CONTAINER="tfstate"
SP_NAME="sp-astro-azure-swa-terraform"

echo "==> Creating storage account: $STATE_SA (in existing rg: $STATE_RG)"
az storage account create \
  --name "$STATE_SA" \
  --resource-group "$STATE_RG" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --output none

echo "==> Creating blob container: $STATE_CONTAINER"
az storage container create \
  --name "$STATE_CONTAINER" \
  --account-name "$STATE_SA" \
  --auth-mode login \
  --output none

echo "==> Creating service principal: $SP_NAME"
SP=$(az ad sp create-for-rbac \
  --name "$SP_NAME" \
  --role Contributor \
  --scopes "/subscriptions/$SUBSCRIPTION_ID" \
  --output json)

CLIENT_ID=$(echo "$SP" | jq -r '.appId')
CLIENT_SECRET=$(echo "$SP" | jq -r '.password')
TENANT_ID=$(echo "$SP" | jq -r '.tenant')

echo "==> Granting Storage Blob Data Contributor on state account"
STATE_SA_ID=$(az storage account show \
  --name "$STATE_SA" \
  --resource-group "$STATE_RG" \
  --query id --output tsv)

az role assignment create \
  --role "Storage Blob Data Contributor" \
  --assignee "$CLIENT_ID" \
  --scope "$STATE_SA_ID" \
  --output none

echo ""
echo "================================================================"
echo " Add these to GitHub → Settings → Secrets → Actions:"
echo "================================================================"
echo ""
echo "  ARM_CLIENT_ID=$CLIENT_ID"
echo "  ARM_CLIENT_SECRET=$CLIENT_SECRET"
echo "  ARM_SUBSCRIPTION_ID=$SUBSCRIPTION_ID"
echo "  ARM_TENANT_ID=$TENANT_ID"
echo ""
echo "After the first successful apply, also add:"
echo "  AZURE_STATIC_WEB_APPS_API_TOKEN=<run: terraform -chdir=infra output -raw deployment_token>"
echo "================================================================"
