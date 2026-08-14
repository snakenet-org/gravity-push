# gravity-push

A GitHub Action that sends a Web Push notification to a
[Gravity](https://github.com/snakenet-org/gravity) Topic — one `POST`, authenticated by a Gravity
API key:

1. **Send** — `POST /api/v1/notify/send` on the Gravity instance, with the API key sent as
   `X-Api-Key` and the shared service secret sent as `X-Ophion-Token`, broadcasting a push
   notification to every subscriber of the given Gravity Topic.

See `gravity/src/gravity/api/v1/notify.py` for the Gravity side of this contract (or `/docs` on a
running instance for the full OpenAPI spec).

## Prerequisites

- A Gravity API key with the "Can Notify via Push" entitlement, created from a logged-in user's
  self-service `/api-keys` page on the Gravity instance. The key must stay `enabled`.
- Gravity's shared `X-Ophion-Token` service secret (`GRAVITY_OPHION_TOKEN` on the Gravity side).
- A Gravity Topic to notify — find existing Topics on Gravity's `/topics` management page.

Unlike this action's previous version, no Authentik M2M client, service-account credentials, or
self-provisioning step are needed — the API key plus the shared service secret authenticate the
call directly, with no OIDC session involved.

## Inputs

| Input                 | Required | Default | Description                                                            |
| ---------------------- | -------- | ------- | ------------------------------------------------------------------------ |
| `push_service_url`     | yes      | —       | Base URL of the Gravity instance.                                        |
| `api_key`              | yes      | —       | Gravity API key with the "Can Notify via Push" entitlement, sent as `X-Api-Key`. **Secret.** |
| `gravity_token`        | yes      | —       | Gravity's shared service secret, sent as `X-Ophion-Token`. **Secret.**   |
| `push_topic_id`        | yes      | —       | UUID of the Gravity Topic to notify.                                     |
| `push_message_title`   | yes      | —       | Notification title.                                                      |
| `push_message_body`    | yes      | —       | Notification body.                                                       |
| `push_message_url`     | no       | `''`    | URL opened when the notification is clicked.                             |

## Outputs

`subscribers`, `sent`, `failed`, `pruned` — the tally `POST /api/v1/notify/send` returns.

## Usage from another workflow

```yaml
- uses: snakenet-org/gravity-push@v1
  with:
    push_service_url: https://snakenet.org/
    api_key: ${{ secrets.GRAVITY_API_KEY }}
    gravity_token: ${{ secrets.GRAVITY_OPHION_TOKEN }}
    push_topic_id: 8f14e45f-ceea-467e-95a5-9a3d5a1f2b3c
    push_message_title: Hello World
    push_message_body: This is a test!
    push_message_url: https://snakenet.org/
```

(Every value above is a dummy — replace with your own configuration and store `api_key` and
`gravity_token` in your repository's Actions secrets, never inline.)

`docs/example-workflow.yml` is a `workflow_dispatch` example of the block above wired to repo
secrets (`PUSH_SERVICE_URL`, `GRAVITY_API_KEY`, `GRAVITY_OPHION_TOKEN`) plus prompted per-message
inputs — copy it into a
consuming repository's `.github/workflows/` to dispatch a push notification by hand. This repo
itself ships no `.github/workflows` of its own, same as `snakenet-org/satellite-deploy` — it's a
reusable action other repos `uses:`, not one that runs itself.

## Development

This is a JavaScript action (`runs.using: node24` — the current Node.js LTS supported by GitHub
Actions runners), matching `snakenet-org/satellite-deploy`'s structure: `index.js` holds the source
(using `@actions/core` + the platform `fetch`/`URL`, both native since Node 18 — no HTTP client
dependency needed), bundled to the committed `dist/index.js` via `build.sh` (`npm install && npx
ncc build index.js -o dist`) — `dist/` must stay committed since that's the file `action.yml`
actually points `runs.main` at. Run `bash build.sh` after any change to `index.js` and commit the
resulting `dist/`.
