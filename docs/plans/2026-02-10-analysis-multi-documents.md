# 2026-02-10 - Multi-document Analysis (JSONB) Plan

**Goal:** Support multiple CPF/CNPJ per analysis, keep analyses immutable, and sync entered documents to the farm when applicable. No backwards compatibility; `app` schema reset is expected.

**Status:** Implemented.

**Scope:**
- Replace `analysis.cpf_cnpj` with `analysis.analysis_docs` (JSONB array).
- Allow selecting multiple documents in **New Analysis** (UI).
- When an analysis is created, add documents to the farm record (if farm exists or is created).
- Show all selected documents in analysis details and PDF.

---

## 1) Database + Prisma

- **Schema changes**
  - Add `analysis.analysis_docs JSONB NOT NULL DEFAULT '[]'`.
  - Remove `analysis.cpf_cnpj`.
- **Migration**
  - Generate migration for `analysis_docs` + drop `cpf_cnpj`.
  - Because compatibility is not required, plan to **reset `app` schema** before deploy.

**Reset steps (app schema only):**
```sql
DROP SCHEMA IF EXISTS app CASCADE;
CREATE SCHEMA app;
```
Then:
```bash
npx prisma migrate deploy
```

---

## 2) API changes

- **DTO**
  - `documents?: string[]`
- **Normalization**
  - `sanitizeDoc` + `isValidCpfCnpj`, dedupe.
  - Convert to `{ docNormalized, docType }[]` for storage.
- **Create analysis**
  - Store `analysisDocs` JSONB array.
  - If farm exists or is created, `upsert` each document into `farm_document`.
  - Keep analysis immutable (documents recorded only at creation time).
- **Detail**
  - Map `analysisDocs` to `docInfos` for UI/PDF.
- **Cache**
  - Bump cache version if payload shape changes.

---

## 3) Web changes

- **NewAnalysisView**
  - Input for `CPF/CNPJ` (add on Enter/blur).
  - Chips list + remove.
  - Toggle existing farm documents (multi-select).
  - Submit payload includes `documents`.
- **Auto-fill guardrails**
  - Só dispara busca quando apenas 1 campo está preenchido (CAR ou documento ou nome).
- **AnalysisDetail / Public / Print**
  - Display multiple documents (and CNPJ validation results).

---

## 4) Tests

- **Web**
  - `NewAnalysisView` submits `documents` array.
- **API**
  - Analyses service: accepts multiple docs, persists JSONB, upserts farm docs.
  - Analysis detail: returns doc list.

---

## 5) Validation / Acceptance

- Create analysis with 2+ docs → detail shows all docs.
- New doc typed in analysis → appears in farm documents list.
- PDFs include all documents (immutably from analysis).
- Auto-fill não sobrescreve quando há mais de um campo preenchido.
