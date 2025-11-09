variable "project_id" {
  description = "The GCP project ID where resources will be created"
  type        = string
}

variable "region" {
  description = "The GCP region for Firestore and other resources"
  type        = string
  default     = "us-central1"
}

variable "database_name" {
  description = "The name of the Firestore database"
  type        = string
  default     = "cymbalflix-db"
}
