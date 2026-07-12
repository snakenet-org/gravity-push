#!/usr/bin/env bash
# Authenticates against snakeNet ID as an M2M client, self-provisions against Gravity, and sends
# a Web Push notification to a Gravity Topic. Invoked by action.yml as a composite run step; every
# input arrives as an env var of the same name.
set -euo pipefail

for var in IDENTITY_PROVIDER_URL M2M_GRANT_TYPE M2M_CLIENT_ID M2M_USERNAME M2M_PASSWORD M2M_SCOPE \
  PUSH_SERVICE_URL PUSH_SERVICE_TOKEN PUSH_TOPIC_ID PUSH_MESSAGE_TITLE PUSH_MESSAGE_BODY \
  DEVICE_IDENTITY; do
  if [[ -z "${!var:-}" ]]; then
    echo "::error::Missing required input for ${var}"
    exit 1
  fi
done

echo "::add-mask::${M2M_PASSWORD}"
echo "::add-mask::${PUSH_SERVICE_TOKEN}"

base_url="${PUSH_SERVICE_URL%/}"

# POSTs to $1 with the given curl args, returns the response body on 2xx, otherwise prints it and fails.
http_post() {
  local url="$1"
  shift
  local response status body
  response="$(curl -sS -X POST "$url" -w $'\n%{http_code}' "$@")"
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if (( status < 200 || status >= 300 )); then
    echo "::error::POST ${url} failed with HTTP ${status}: ${body}"
    exit 1
  fi
  printf '%s' "$body"
}

echo "::group::Authenticate against snakeNet ID"
token_response="$(http_post "$IDENTITY_PROVIDER_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode "grant_type=${M2M_GRANT_TYPE}" \
  --data-urlencode "client_id=${M2M_CLIENT_ID}" \
  --data-urlencode "username=${M2M_USERNAME}" \
  --data-urlencode "password=${M2M_PASSWORD}" \
  --data-urlencode "scope=${M2M_SCOPE}")"

access_token="$(jq -r '.access_token // empty' <<<"$token_response")"
if [[ -z "$access_token" ]]; then
  echo "::error::Identity provider response did not contain an access_token"
  exit 1
fi
echo "::add-mask::${access_token}"
echo "Obtained access token."
echo "::endgroup::"

echo "::group::Provision against Gravity"
provision_body="$(jq -nc --arg d "$DEVICE_IDENTITY" '{device_identity: $d}')"
provision_response="$(http_post "${base_url}/api/v1/auth/m2m/provision" \
  -H "Content-Type: application/json" \
  -H "X-Ophion-Token: ${PUSH_SERVICE_TOKEN}" \
  -H "Authorization: Bearer ${access_token}" \
  --data "$provision_body")"
echo "$provision_response" | jq -c '{message, id, created, device_added, entitlements, is_admin}'
echo "::endgroup::"

echo "::group::Send push notification"
send_body="$(jq -nc \
  --arg topic_id "$PUSH_TOPIC_ID" \
  --arg title "$PUSH_MESSAGE_TITLE" \
  --arg body "$PUSH_MESSAGE_BODY" \
  --arg url "${PUSH_MESSAGE_URL:-}" \
  '{topic_id: $topic_id, title: $title, body: $body} + (if $url != "" then {url: $url} else {} end)')"
send_response="$(http_post "${base_url}/api/v1/push/send" \
  -H "Content-Type: application/json" \
  -H "X-Ophion-Token: ${PUSH_SERVICE_TOKEN}" \
  -H "Authorization: Bearer ${access_token}" \
  --data "$send_body")"
echo "$send_response" | jq -c '.'
echo "::endgroup::"

{
  echo "subscribers=$(jq -r '.subscribers' <<<"$send_response")"
  echo "sent=$(jq -r '.sent' <<<"$send_response")"
  echo "failed=$(jq -r '.failed' <<<"$send_response")"
  echo "pruned=$(jq -r '.pruned' <<<"$send_response")"
} >>"$GITHUB_OUTPUT"
