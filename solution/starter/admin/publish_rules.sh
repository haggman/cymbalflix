#!/bin/bash
# Publish Firestore security rules to a named database using the Firebase Rules API.
#
# This is what the Firebase console's Publish button and `firebase deploy` do
# underneath: upload the rules file as a ruleset, then point the database's
# release at it. Calling the API directly works in projects that can't be
# registered as Firebase projects (such as lab projects).
#
# Usage: bash admin/publish_rules.sh [rules-file] [database-id]
#   rules-file   defaults to admin/firestore.rules
#   database-id  defaults to $FIRESTORE_DATABASE, then cymbalflix-db

set -euo pipefail

RULES_FILE="${1:-admin/firestore.rules}"
DATABASE="${2:-${FIRESTORE_DATABASE:-cymbalflix-db}}"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
TOKEN="$(gcloud auth print-access-token)"
API="https://firebaserules.googleapis.com/v1"
RELEASE_ID="cloud.firestore/${DATABASE}"

if [ ! -f "$RULES_FILE" ]; then
  echo "Rules file not found: $RULES_FILE" >&2
  exit 1
fi

api() {  # api METHOD PATH [JSON-BODY]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" "${API}/${path}" \
      -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT" \
      -H "Content-Type: application/json" -d "$body"
  else
    curl -sS -X "$method" "${API}/${path}" \
      -H "Authorization: Bearer $TOKEN" -H "X-Goog-User-Project: $PROJECT"
  fi
}

echo "Project:  $PROJECT"
echo "Database: $DATABASE"
echo "Rules:    $RULES_FILE"
echo

echo "1. Uploading rules as a new ruleset..."
RULESET_BODY="$(jq -Rs '{source:{files:[{name:"firestore.rules",content:.}]}}' "$RULES_FILE")"
RULESET_RESP="$(api POST "projects/${PROJECT}/rulesets" "$RULESET_BODY")"
RULESET="$(echo "$RULESET_RESP" | jq -r '.name // empty')"
if [ -z "$RULESET" ]; then
  echo "Ruleset upload failed:" >&2
  echo "$RULESET_RESP" >&2
  exit 1
fi
echo "   $RULESET"

echo "2. Pointing the database's release at it..."
RELEASE_BODY="{\"name\":\"projects/${PROJECT}/releases/${RELEASE_ID}\",\"rulesetName\":\"${RULESET}\"}"
RELEASE_RESP="$(api POST "projects/${PROJECT}/releases" "$RELEASE_BODY")"
if echo "$RELEASE_RESP" | jq -e '.error.status == "ALREADY_EXISTS"' >/dev/null 2>&1; then
  # A release already exists (Firestore creates a deny-all one with the database); update it.
  RELEASE_RESP="$(api PATCH "projects/${PROJECT}/releases/${RELEASE_ID}" "{\"release\":${RELEASE_BODY}}")"
fi
if echo "$RELEASE_RESP" | jq -e '.error' >/dev/null 2>&1; then
  echo "Release failed:" >&2
  echo "$RELEASE_RESP" >&2
  exit 1
fi

echo
echo "Live release for ${DATABASE}:"
api GET "projects/${PROJECT}/releases/${RELEASE_ID}" | jq .
echo
echo "Done. Rules take effect within a few seconds."
