# Reset do schema app (sem tocar no landwatch)

Este guia reseta **apenas** o schema `app` usado pelo `apps/api` (Prisma).
Nao execute nada disso no schema `landwatch` (versionamento).

## Quando usar
- Precisa limpar dados do app e recriar tabelas.
- Quer aplicar todas as migrations do zero no schema `app`.

## Requisitos
- Acesso ao mesmo banco configurado em `apps/api/.env` (`DATABASE_URL`).
- Prisma instalado no `apps/api` (usa `npx`).

## Passo 1: resetar o schema app

### Opcao A: pgAdmin (Query Tool)
```sql
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;
```

### Opcao B: psql (terminal)
```bash
psql "<DATABASE_URL>"
```
```sql
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;
```

> Importante: isso remove todos os dados do app, incluindo `_prisma_migrations`.

## Passo 2: recriar tabelas via Prisma

No diretorio `apps/api`:
```bash
cd C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/api
npx prisma migrate deploy
npx prisma generate
```

> Em ambiente local, se preferir:
```bash
npx prisma migrate dev
```

## Verificacao rapida
```sql
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'app'
ORDER BY table_name;
```

## Observacoes
- O schema `landwatch` (versionamento) nao e tocado nesse processo.
- Se precisar seed para testes, use os scripts de teste em `apps/api/prisma/seed-test.ts`.

