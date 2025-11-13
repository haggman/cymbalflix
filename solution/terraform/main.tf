# Enable required APIs
resource "google_project_service" "firestore" {
  project = var.project_id
  service = "firestore.googleapis.com"
  
  disable_on_destroy = false
}

resource "google_project_service" "run" {
  project = var.project_id
  service = "run.googleapis.com"
  
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  project = var.project_id
  service = "iam.googleapis.com"
  
  disable_on_destroy = false
}

# Create Firestore database
resource "google_firestore_database" "cymbalflix" {
  project          = var.project_id
  name             = var.database_name
  location_id      = var.region
  type             = "FIRESTORE_NATIVE"
  database_edition = "ENTERPRISE"
  
  depends_on = [
    google_project_service.firestore
  ]
}

# Create custom service account for Cloud Run
resource "google_service_account" "cymbalflix_run" {
  project      = var.project_id
  account_id   = "cymbalflix-run-sa"
  display_name = "CymbalFlix Cloud Run Service Account"
  description  = "Service account for CymbalFlix Cloud Run service to access Firestore"
  
  depends_on = [
    google_project_service.iam
  ]
}

# Grant the service account access to Firestore
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cymbalflix_run.email}"
}

# Additional permission for Firestore operations
resource "google_project_iam_member" "firestore_owner" {
  project = var.project_id
  role    = "roles/datastore.owner"
  member  = "serviceAccount:${google_service_account.cymbalflix_run.email}"
}
