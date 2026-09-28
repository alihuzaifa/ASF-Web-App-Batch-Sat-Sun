#!/usr/bin/env bash
# One-time setup of Huzaifa's LinkedIn poster. Ali runs this in Git Bash, AFTER
# adnan-marketplace has been paused in the Supabase dashboard (free plan = 2 active).
#
#   cd huzaifa-marketplace/automation/linkedin-scheduler && bash go-live.sh
#
# Creates the project, applies the schema + cron, deploys the function, sets the
# secrets, connects LinkedIn (browser), and sends one test post right away.
set -euo pipefail
cd "$(dirname "$0")"

ORG=cyzonrajfzrztmnkbbix
NAME=huzaifa-linkedin
REGION=ap-south-1
TEST_CAPTION=../../output/first-post.caption.md
TEST_IMAGE=../../output/first-post.png

setenv() { # setenv KEY VALUE  -> writes/replaces KEY in .env
  grep -v "^$1=" .env > .env.tmp || true
  echo "$1=$2" >> .env.tmp && mv .env.tmp .env
}

REF=$(supabase projects list -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=(JSON.parse(s).projects||JSON.parse(s)).find(p=>p.name==='$NAME');console.log(p?p.ref:'')})")
if [ -z "$REF" ]; then
  echo "1/7 creating project $NAME"
  DBPASS=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
  supabase projects create "$NAME" --org-id "$ORG" --region "$REGION" --db-password "$DBPASS" -o json > /dev/null
  setenv SUPABASE_DB_PASSWORD "$DBPASS"
  REF=$(supabase projects list -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=(JSON.parse(s).projects||JSON.parse(s)).find(p=>p.name==='$NAME');console.log(p.ref)})")
fi
echo "   project ref: $REF"

echo "2/7 waiting for the project to come up"
status() { supabase projects list -o json 2>/dev/null | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=(JSON.parse(s).projects||JSON.parse(s)).find(p=>p.ref==='$REF');console.log(p?p.status:'')})"; }
until [ "$(status)" = "ACTIVE_HEALTHY" ]; do sleep 10; done

echo "3/7 keys into .env"
KEY=$(supabase projects api-keys --project-ref "$REF" --reveal -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const k=JSON.parse(s);const a=Array.isArray(k)?k:(k.keys||k.api_keys||[]);const x=a.find(k=>k.type==='secret')||a.find(k=>k.name==='service_role');console.log(x.api_key)})")
setenv SUPABASE_URL "https://$REF.supabase.co"
setenv SUPABASE_SERVICE_ROLE_KEY "$KEY"
CRON=$(grep '^CRON_SECRET=' .env | cut -d= -f2- || true)
if [ -z "$CRON" ]; then CRON=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"); setenv CRON_SECRET "$CRON"; fi

echo "4/7 schema + daily 09:00 cron"
supabase link --project-ref "$REF" > /dev/null
sed -e "s#<SUPABASE_URL>#https://$REF.supabase.co#g" -e "s#<CRON_SECRET>#$CRON#g" supabase/schema.sql > schema.local.sql
supabase db query --linked -f schema.local.sql > /dev/null
rm schema.local.sql

echo "5/7 function + secrets"
set -a; . ./.env; set +a
supabase functions deploy post-to-linkedin --no-verify-jwt --project-ref "$REF"
supabase secrets set --project-ref "$REF" CRON_SECRET="$CRON" LINKEDIN_CLIENT_ID="$LINKEDIN_CLIENT_ID" LINKEDIN_CLIENT_SECRET="$LINKEDIN_CLIENT_SECRET" > /dev/null

echo "6/7 connect LinkedIn: open the URL below, log in AS HUZAIFA, press Allow"
npm run oauth

echo "7/7 test post"
npm run enqueue -- --caption="$TEST_CAPTION" --image="$TEST_IMAGE" --now
curl -s -X POST "https://$REF.supabase.co/functions/v1/post-to-linkedin" -H "x-cron-secret: $CRON"
echo
npm run queue
echo "Done. Check Huzaifa's LinkedIn profile. From now on the cron posts at 09:00 PKT daily."
