# Automation API Key Endpoints

This document defines the M2M contract for automation clients (Fabric pipeline, notebooks, cron jobs).

## Authentication
- Header: `x-api-key: <raw-api-key>`
- API keys are managed by platform admin routes (`/v1/admin/api-keys/*`).
- The backend stores only hash/prefix for keys, never the raw key.

## Required Scopes
- `analysis_write`:
  - `POST /v1/automation/analyses`
- `analysis_read`:
  - `GET /v1/automation/auth/me`
  - `GET /v1/automation/analyses/:id`
  - `GET /v1/automation/analyses/:id/map`

## Endpoints

### `GET /v1/automation/auth/me`
- Purpose: validate API key in runtime and inspect principal context.
- Response fields:
  - `apiKeyId`
  - `clientId`
  - `orgId`
  - `scopes`

Example:

```bash
curl -X GET "http://localhost:3001/v1/automation/auth/me" \
  -H "x-api-key: lwk_xxx"
```

### `POST /v1/automation/analyses`
- Purpose: create analysis via M2M API key (automation path).
- Payload contract is aligned with user endpoint `POST /v1/analyses`.

Example:

```bash
curl -X POST "http://localhost:3001/v1/automation/analyses" \
  -H "Content-Type: application/json" \
  -H "x-api-key: lwk_xxx" \
  -d '{
    "carKey": "MT-5107047-9F2A93A57D0E4EF8A3B37D0F0A52D0C0",
    "analysisDate": "2026-03-04",
    "documents": ["04252011000110"]
  }'
```

### `GET /v1/automation/analyses/:id`
- Purpose: retrieve analysis detail.

### `GET /v1/automation/analyses/:id/map`
- Purpose: retrieve analysis map features.

## Separation Rules
- Web/user flows remain in `/v1/*` with JWT bearer auth.
- Automation flows use `/v1/automation/*` with API key auth.
- `x-api-key` does not grant access to user endpoints.
- Bearer JWT does not replace API key on automation endpoints.
