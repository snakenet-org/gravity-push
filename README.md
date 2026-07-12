# gravity-push

A GitHub Action that authenticates against snakeNet ID (Authentik) as an M2M client,
self-provisions that client against [Gravity](https://github.com/snakenet-org/gravity), and sends
a Web Push notification to a Gravity Topic — three steps, one action:

1. **Authenticate** — `POST` to the identity provider's token endpoint with the configured M2M
   credentials, receiving an Authentik access token.
2. **Provision** — `POST /api/v1/auth/m2m/provision` on the Gravity instance, self-provisioning (or
   refreshing) this client as a Bot user, keyed by the token's `sub`.
3. **Send** — `POST /api/v1/push/send`, broadcasting a push notification to every subscriber of the
   given Gravity Topic.

See `gravity/src/gravity/api/v1/auth.py` and `gravity/src/gravity/api/v1/push.py` for the Gravity
side of this contract (or `/docs` on a running instance for the full OpenAPI spec).

## Prerequisites

- An Authentik M2M application/client configured for `id.snakenet.io`, granted a service-account
  username/password, and accepting the `client_credentials` grant type.
- The identity provider request always requests the `openid profile groups` scope (hardcoded, not
  configurable) so Gravity can resolve this client's entitlements from the token's `groups` claim.
- The Bot account this client provisions into must carry the `gravity-push-user` Authentik group
  (or be an admin) — `POST /api/v1/push/send` is gated on the `push` entitlement. Group membership
  is re-resolved on every provision call, so it can be granted/revoked at any time.
- A Gravity Topic to notify — list existing Topics with `GET /api/v1/push/topics` (Ophion + JWT
  gated), or from Gravity's `/topics` management page.
- Gravity's shared `X-Ophion-Token` service secret (`GRAVITY_OPHION_TOKEN` on the Gravity side).

## Inputs

| Input                 | Required | Default                       | Description                                                                          |
| ---------------------- | -------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `identity_provider_url`| yes      | —                               | Authentik OAuth2 token endpoint.                                                       |
| `m2m_client_id`        | yes      | —                               | M2M client id registered in Authentik.                                                 |
| `m2m_username`         | yes      | —                               | M2M service-account username.                                                          |
| `m2m_password`         | yes      | —                               | M2M service-account password. **Secret.**                                             |
| `push_service_url`     | yes      | —                               | Base URL of the Gravity instance.                                                      |
| `push_service_token`   | yes      | —                               | Gravity's shared service secret, sent as `X-Ophion-Token`. **Secret.**                |
| `push_topic_id`        | yes      | —                               | UUID of the Gravity Topic to notify.                                                   |
| `push_message_title`   | yes      | —                               | Notification title.                                                                    |
| `push_message_body`    | yes      | —                               | Notification body.                                                                     |
| `push_message_url`     | no       | `''`                            | URL opened when the notification is clicked.                                           |
| `device_identity`      | no       | `github-actions:<repo>/<workflow>` | Device identity recorded on the Bot account for this M2M client.                  |

`push_topic_id` isn't in the original parameter list this action was speced from — Gravity's
`/api/v1/push/send` always targets one Topic, and Gravity has no "default" Topic concept, so it's a
required input here. `m2m_grant_type` (`client_credentials`) and `m2m_scope`
(`openid profile groups`) aren't configurable inputs — they're hardcoded in `index.js`.

## Outputs

`subscribers`, `sent`, `failed`, `pruned` — the tally `POST /api/v1/push/send` returns.

## Usage from another workflow

```yaml
- uses: snakenet-org/gravity-push@v1
  with:
    identity_provider_url: https://id.snakenet.io/application/o/token/
    m2m_client_id: 1fyrLVUQPBEtxhh6IxwFstwRUikjeebF2ruSf1xY
    m2m_username: gravity-probe
    m2m_password: ${{ secrets.GRAVITY_M2M_PASSWORD }}
    push_service_url: https://snakenet.org/
    push_service_token: ${{ secrets.GRAVITY_OPHION_TOKEN }}
    push_topic_id: 8f14e45f-ceea-467e-95a5-9a3d5a1f2b3c
    push_message_title: Hello World
    push_message_body: This is a test!
    push_message_url: https://snakenet.org/
```

(Every value above is a dummy — replace with your own configuration and store the two secrets in
your repository's Actions secrets, never inline.)

`docs/example-workflow.yml` is a `workflow_dispatch` example of the block above wired to repo
secrets (`IDENTITY_PROVIDER_URL`, `M2M_CLIENT_ID`, `M2M_USERNAME`, `M2M_PASSWORD`,
`PUSH_SERVICE_URL`, `PUSH_SERVICE_TOKEN`) plus prompted per-message inputs — copy it into a
consuming repository's `.github/workflows/` to dispatch a push notification by hand. This repo
itself ships no `.github/workflows` of its own, same as `snakenet-org/satellite-deploy` — it's a
reusable action other repos `uses:`, not one that runs itself.

## Development

This is a JavaScript action (`runs.using: node20`), matching `snakenet-org/satellite-deploy`'s
structure: `index.js` holds the source (using `@actions/core` + the platform `fetch`), bundled to
the committed `dist/index.js` via `build.sh` (`npm install && npx ncc build index.js -o dist`) —
`dist/` must stay committed since that's the file `action.yml` actually points `runs.main` at.
Run `bash build.sh` after any change to `index.js` and commit the resulting `dist/`.
