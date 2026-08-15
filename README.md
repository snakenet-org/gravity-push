# pulsar-push

A GitHub Action that sends a Web Push notification to a
[Pulsar](https://github.com/snakenet-org/pulsar) Topic — one `POST`, authenticated by a Pulsar
Access Key:

1. **Send** — `POST /api/v1/notify/send` on the Pulsar instance, with the Access Key sent as
   `X-Pulsar-Access-Key` and the shared service secret sent as `X-Pulsar-Token`, broadcasting a
   push notification to every subscriber of the given Pulsar Topic.

See `pulsar/src/pulsar/api/v1/notify.py` for the Pulsar side of this contract (or `/docs` on a
running instance for the full OpenAPI spec).

## Prerequisites

- A Pulsar Access Key, created by an admin from a logged-in admin's `/access-keys` page on the
  Pulsar instance. The key must stay `enabled`.
- Pulsar's shared `X-Pulsar-Token` service secret (`PULSAR_TOKEN` on the Pulsar side).
- A Pulsar Topic to notify — find existing Topics on Pulsar's `/topics` management page.

The Access Key plus the shared service secret authenticate the call directly, with no OIDC
session involved.

## Inputs

| Input                      | Required | Default | Description                                                            |
| --------------------------- | -------- | ------- | ------------------------------------------------------------------------ |
| `push_service_url`          | yes      | —       | Base URL of the Pulsar instance.                                         |
| `push_service_access_key`   | yes      | —       | Pulsar Access Key, sent as `X-Pulsar-Access-Key`. **Secret.**            |
| `push_service_token`        | yes      | —       | Pulsar's shared service secret, sent as `X-Pulsar-Token`. **Secret.**    |
| `push_topic_id`             | yes      | —       | UUID of the Pulsar Topic to notify.                                      |
| `push_message_title`        | yes      | —       | Notification title.                                                      |
| `push_message_body`         | yes      | —       | Notification body.                                                      |
| `push_message_url`          | no       | `''`    | URL opened when the notification is clicked.                             |

## Outputs

`subscribers`, `sent`, `failed`, `pruned` — the tally `POST /api/v1/notify/send` returns.

## Usage from another workflow

```yaml
- uses: snakenet-org/pulsar-push@v1
  with:
    push_service_url: https://your-domain.com/
    push_service_access_key: ${{ secrets.PULSAR_ACCESS_KEY }}
    push_service_token: ${{ secrets.PULSAR_TOKEN }}
    push_topic_id: 8f14e45f-ceea-467e-95a5-9a3d5a1f2b3c
    push_message_title: Hello World
    push_message_body: This is a test!
    push_message_url: https://your-domain.com/hello-world
```

(Every value above is a dummy — replace with your own configuration and store
`push_service_access_key` and `push_service_token` in your repository's Actions secrets, never
inline.)

`docs/example-workflow.yml` is a `workflow_dispatch` example of the block above wired to repo
secrets (`PUSH_SERVICE_URL`, `PULSAR_ACCESS_KEY`, `PULSAR_TOKEN`) plus prompted per-message
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
