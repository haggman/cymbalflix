#!/bin/bash
# Instructor verification kit for the CymbalFlix / Firestore Enterprise lab.
#
# Run from anywhere in Cloud Shell after the lab checkpoint each stage names:
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh infra      # after Task 1.1 (terraform apply)
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh data       # after Task 1.3 (npm run import), again after 3.5
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh rules      # after Task 5.6 (publish_rules.sh)
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh realtime   # after Task 5.6 (needs rules)
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh vector     # after Task 6.3 (embeddings + index)
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh text       # after Task 7.1 (text index)
#   bash ~/cymbalflix/solution/starter/admin/verify/verify.sh all
#
# Node stages run with the starter app's node_modules and .env.

set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
STARTER="${STARTER_DIR:-$HOME/cymbalflix/starter}"
DB="${FIRESTORE_DATABASE:-cymbalflix-db}"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
PASS=0; FAIL=0
ok()   { echo "  PASS  $*"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $*"; FAIL=$((FAIL+1)); }
info() { echo "  ....  $*"; }
hdr()  { echo; echo "== $* =="; }

node_stage() {  # node_stage script.js
  ( cd "$STARTER" && NODE_PATH="$STARTER/node_modules" STARTER_DIR="$STARTER" node "$HERE/$1" )
  if [ $? -eq 0 ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
}

stage_infra() {
  hdr "Database settings ($DB)"
  local desc; desc="$(gcloud firestore databases describe --database="$DB" --format=json 2>/dev/null)" || { bad "database $DB not found"; return; }
  check_field() { local f="$1" want="$2"; local got; got="$(echo "$desc" | jq -r ".$f // \"(missing)\"")"
    if [ "$got" = "$want" ]; then ok "$f = $got"; else bad "$f = $got (want $want)"; fi; }
  check_field databaseEdition ENTERPRISE
  check_field type FIRESTORE_NATIVE
  check_field firestoreDataAccessMode DATA_ACCESS_MODE_ENABLED
  check_field mongodbCompatibleDataAccessMode DATA_ACCESS_MODE_ENABLED
  check_field realtimeUpdatesMode REALTIME_UPDATES_MODE_ENABLED
  check_field enhancedTextSearchQueryMode ENHANCED_QUERY_MODE_ENABLED
  info "location: $(echo "$desc" | jq -r .locationId)   uid: $(echo "$desc" | jq -r .uid)"

  hdr "APIs enabled"
  local enabled; enabled="$(gcloud services list --enabled --format='value(config.name)' 2>/dev/null)"
  for api in firestore.googleapis.com run.googleapis.com iam.googleapis.com aiplatform.googleapis.com firebaserules.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com; do
    if echo "$enabled" | grep -qx "$api"; then ok "$api"; else bad "$api not enabled"; fi
  done

  hdr "Cloud Run service account"
  local sa="cymbalflix-run-sa@${PROJECT}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe "$sa" >/dev/null 2>&1; then
    ok "$sa exists"
    local roles; roles="$(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' --filter="bindings.members:serviceAccount:$sa" --format='value(bindings.role)' 2>/dev/null | tr '\n' ' ')"
    info "roles: $roles"
    echo "$roles" | grep -q 'roles/datastore.user' && ok "has roles/datastore.user" || bad "missing roles/datastore.user"
  else
    bad "$sa not found"
  fi

  hdr "Audit logging (Data Access) for Firestore"
  # Firestore data-access logs are configured on datastore.googleapis.com (which covers
  # firestore.googleapis.com too); the log entries themselves report firestore.googleapis.com.
  local cfg; cfg="$(gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null | jq -c '.auditConfigs[]? | select(.service=="datastore.googleapis.com" or .service=="allServices")')"
  if [ -n "$cfg" ]; then
    local types; types="$(echo "$cfg" | jq -r '[.auditLogConfigs[].logType] | join(" ")')"
    if echo "$types" | grep -q DATA_READ && echo "$types" | grep -q DATA_WRITE; then
      ok "datastore.googleapis.com audit config: $types"
    else
      bad "datastore.googleapis.com audit config present but missing DATA_READ/DATA_WRITE ($types)"
    fi
  else
    bad "no data-access audit config for datastore.googleapis.com (Task 4.14 will show no data-access logs)"
  fi

  hdr "Tools on the Cloud Shell image"
  for t in agy mongosh terraform node jq; do
    if command -v "$t" >/dev/null 2>&1; then ok "$t: $(command -v "$t")"; else info "$t not found (agy/mongosh: lab has fallbacks; terraform: Task 1 installs it)"; fi
  done
}

stage_data()     { hdr "Data via MongoDB API";   node_stage verify_data.js; }
stage_realtime() { hdr "Real-time push (MongoDB write -> Native listener)"; node_stage verify_realtime.js; }
stage_vector()   {
  hdr "Vector index"
  local idx; idx="$(gcloud firestore indexes composite list --database="$DB" --format=json 2>/dev/null | jq -r '.[] | select(.fields[]?.vectorConfig != null) | "\(.name | split("/") | last)  \(.state)"')"
  if [ -n "$idx" ]; then
    echo "$idx" | while read -r line; do case "$line" in *READY*) ok "vector index $line";; *) bad "vector index $line";; esac; done
  else bad "no vector index on $DB (Task 6.2 step 1)"; fi
  hdr "Vector search via Firestore Native API"; node_stage verify_vector.js
}
stage_text()     { hdr "Full-text search via MongoDB API"; node_stage verify_text.js; }

stage_rules() {
  hdr "Security rules release for $DB"
  local tok; tok="$(gcloud auth print-access-token)"
  local rel; rel="$(curl -sS "https://firebaserules.googleapis.com/v1/projects/$PROJECT/releases/cloud.firestore/$DB" -H "Authorization: Bearer $tok" -H "X-Goog-User-Project: $PROJECT")"
  local rs; rs="$(echo "$rel" | jq -r '.rulesetName // empty')"
  if [ -z "$rs" ]; then bad "no release found: $(echo "$rel" | jq -c .)"; return; fi
  ok "release -> $rs"
  local src; src="$(curl -sS "https://firebaserules.googleapis.com/v1/$rs" -H "Authorization: Bearer $tok" -H "X-Goog-User-Project: $PROJECT" | jq -r '.source.files[0].content')"
  if echo "$src" | grep -q 'allow read: if true' && echo "$src" | grep -q 'allow write: if true'; then ok "live ruleset is the test-mode (open) rules"; else bad "live ruleset is not the lab's test-mode rules:"; echo "$src" | sed 's/^/        /'; fi
}

run() { case "$1" in
  infra) stage_infra;; data) stage_data;; rules) stage_rules;; realtime) stage_realtime;;
  vector) stage_vector;; text) stage_text;;
  all) stage_infra; stage_data; stage_rules; stage_realtime; stage_vector; stage_text;;
  *) echo "unknown stage: $1"; sed -n '2,13p' "$0"; exit 2;;
esac; }

[ $# -eq 0 ] && { sed -n '2,13p' "$0"; exit 2; }
echo "Project: $PROJECT   Database: $DB   Starter: $STARTER"
for stage in "$@"; do run "$stage"; done
echo; echo "Summary: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
