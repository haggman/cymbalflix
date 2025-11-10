output "project_id" {
  description = "The GCP project ID"
  value       = var.project_id
}

output "region" {
  description = "The GCP region"
  value       = var.region
}

output "database_name" {
  description = "The Firestore database name"
  value       = google_firestore_database.cymbalflix.name
}

output "database_id" {
  description = "The full database ID"
  value       = google_firestore_database.cymbalflix.id
}

output "service_account_email" {
  description = "The service account email that Cloud Run should use"
  value       = google_service_account.cymbalflix_run.email
}

output "connection_instructions" {
  description = "Instructions for connecting to the database"
  value       = <<-EOT
    
    ========================================
    Firestore Database Created Successfully!
    ========================================
    
    Database Name: ${google_firestore_database.cymbalflix.name}
    Database UID:  ${google_firestore_database.cymbalflix.uid}
    Location:      ${var.region}
    
    Service Account: ${google_service_account.cymbalflix_run.email}
    
    ========================================
    MongoDB Connection Details
    ========================================
    
    Firestore Host (for .env file):
    ${google_firestore_database.cymbalflix.uid}.${var.region}.firestore.goog
    
    Full MongoDB Connection String Format:
    mongodb://<username>:<password>@${google_firestore_database.cymbalflix.uid}.${var.region}.firestore.goog:443/${var.database_name}?loadBalanced=true&tls=true&authMechanism=SCRAM-SHA-256&retryWrites=false
    or, if you are using more integrated IAM authentication:
    mongodb://${google_firestore_database.cymbalflix.uid}.${var.region}.firestore.goog:443/${var.database_name}?loadBalanced=true&tls=true&retryWrites=false&authMechanism=MONGODB-OIDC&authMechanismProperties=TOKEN_RESOURCE:FIRESTORE

    
    ========================================
    
  EOT
}