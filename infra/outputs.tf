output "static_web_app_url" {
  description = "Default hostname of the deployed Static Web App."
  value       = "https://${azurerm_static_web_app.main.default_host_name}"
}

output "deployment_token" {
  description = "Deployment token — set this as AZURE_STATIC_WEB_APPS_API_TOKEN in GitHub secrets."
  value       = azurerm_static_web_app.main.api_key
  sensitive   = true
}
