variable "subscription_id" {
  description = "Azure subscription ID."
  type        = string
  default     = "e1289da2-5faa-44b8-b780-7609260fa273"
}

variable "location" {
  description = "Azure region for all resources."
  type        = string
  default     = "eastus2"
}

variable "resource_group_name" {
  description = "Name of the resource group."
  type        = string
  default     = "astro-azure-swa-rg"
}

variable "app_name" {
  description = "Name of the Static Web App resource."
  type        = string
  default     = "astro-azure-swa"
}

variable "sku_tier" {
  description = "SWA SKU tier: Free or Standard. Standard is required for custom domains and managed functions."
  type        = string
  default     = "Free"

  validation {
    condition     = contains(["Free", "Standard"], var.sku_tier)
    error_message = "sku_tier must be 'Free' or 'Standard'."
  }
}
