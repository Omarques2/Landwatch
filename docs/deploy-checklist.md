# Deploy Checklist (Staging -> Produção)

1. `npx prisma migrate deploy`
2. `npm run test:e2e`
3. `npm run build` (api/web)
4. Smoke test: `/health` e `/ready`
5. Validar logs estruturados e rate limit (429)
6. Confirmar envs críticos (DB, Entra, Mapbox)
