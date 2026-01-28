# Hardening Checklist

Use this checklist when validating staging/production.

## CORS
- Set `CORS_ORIGINS` to the exact allowed origins.
- If `CORS_CREDENTIALS=true`, confirm the allowed origin list is not empty.
- Test with an invalid Origin header and confirm 403/blocked.

## CSP (optional for Power BI)
- Enable with `ENABLE_CSP=true` only after testing embed.
- Add Power BI hosts to `CSP_FRAME_SRC` and `CSP_CONNECT_SRC` when needed.
- Confirm the embed still renders and no CSP violations appear.

## Rate limiting
- Validate `/admin/*` and `/auth/*` return 429 under load.
- Tune `RATE_LIMIT_*` for your traffic profile.

## Trust proxy
- Set `TRUST_PROXY=true` only behind a trusted proxy/load balancer.
- Confirm client IP and rate limit behavior are correct.

## TLS DB validation
- In production/staging, `DB_SSL_ALLOW_INVALID` must be false.
- Validate connection fails with invalid certs and succeeds with valid ones.

## Secrets hygiene
- Keep `.env` out of source control; use `.env.example` as a template.
- Never log request bodies or environment variables.
