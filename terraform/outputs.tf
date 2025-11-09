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
  value       = google_firestore_database.cymbaflix.name
}

output "database_id" {
  description = "The full database ID"
  value       = google_firestore_database.cymbaflix.id
}

output "service_account_email" {
  description = "The service account email that Cloud Run should use"
  value       = google_service_account.cymbaflix_run.email
}

output "connection_instructions" {
  description = "Instructions for connecting to the database"
  value       = <<-EOT
    
    Firestore Database Created Successfully!
    
    Database Name: ${google_firestore_database.cymbaflix.name}
    Location: ${var.region}
    
    Service Account: ${google_service_account.cymbaflix_run.email}
    
    To connect from your application, use the MongoDB connection string format:
    mongodb://[username]:[password]@${var.region}.firestore.googleapis.com:27017/${var.database_name}?retryWrites=false&authSource=admin
    
    Note: When running on Cloud Run, authentication will be handled automatically via the service account.
    
    Next steps:
    1. Navigate to the starter/ directory
    2. Run npm install
    3. Import the MovieLens data: node server/db/import.js
    4. Deploy to Cloud Run with the custom service account:
       gcloud run deploy cymbaflix --source . --service-account=${google_service_account.cymbaflix_run.email}
    
  EOT
}
