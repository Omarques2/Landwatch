# Tier & Abate — quebra de quantidade por sexo

Data: 2026-07-24
Branch: feat/tier-module

## Problema

Hoje `Tier.qtdAnimais` e `TierAbate.qtd` guardam um único total de animais, sem
sexo. É preciso lançar quantidades diferentes por sexo dentro de **um mesmo**
Tier e de **um mesmo** Abate (não dois registros com IDs diferentes). Os sexos
são **MACHO**, **FEMEA** e **INDEFINIDO** (quando a informação não existe).
Qualquer combinação é válida.

## Decisões (fechadas no brainstorming)

1. **Modelo:** 3 colunas por sexo (`qtdMacho`, `qtdFemea`, `qtdIndefinido`) em
   `tier` e `tier_abate`. Sexo é enum fixo pequeno — colunas, não tabela filha,
   não enum de banco novo.
2. **Total:** **derivado** (`qtdMacho + qtdFemea + qtdIndefinido`). Sem coluna de
   total armazenada nas linhas vivas. As 3 colunas são a única fonte.
3. **Crédito / saldo:** **total-only**. Sexo é rastreabilidade; `creditoRestante`
   (aprovado − abatido) e `saldo` continuam sobre o total.
4. **Cobrança / preço:** **preço único**. `contratoValorAnimal` /
   `contratoValorAdicionalAprovado` não variam por sexo; cobrança calcula sobre o
   total.

## Escopo excluído (YAGNI)

Sexo em cobrança, sexo em consumo (`TierAbateConsumo`), crédito por sexo, preço
por sexo. Todos descartados.

## Modelo de dados

```prisma
model Tier {
  // remove: qtdAnimais Int @map("qtd_animais")
  qtdMacho      Int @default(0) @map("qtd_macho")
  qtdFemea      Int @default(0) @map("qtd_femea")
  qtdIndefinido Int @default(0) @map("qtd_indefinido")
  // ... demais campos inalterados
}

model TierAbate {
  // remove: qtd Int
  qtdMacho      Int @default(0) @map("qtd_macho")
  qtdFemea      Int @default(0) @map("qtd_femea")
  qtdIndefinido Int @default(0) @map("qtd_indefinido")
  // ... demais campos inalterados
}
```

**CHECK constraints** (via SQL na migração; Prisma não gerencia CHECK):
- cada coluna `>= 0`
- soma `>= 1` (pelo menos um animal por Tier / Abate)

**Inalterado:** `TierCobranca` e `TierCobrancaItem` — `qtd_animais` /
`qtd_aprovados` são snapshots congelados do total no momento da cobrança.
`TierAbateConsumo.qtdConsumida` segue no total, sem sexo.

## Migração (staging — sem Postgres local; gate = `nest build`)

Uma migração nova `..._tier_abate_sexo`:

`tier`:
1. `ADD COLUMN qtd_macho/qtd_femea/qtd_indefinido int NOT NULL DEFAULT 0`
2. `UPDATE ... SET qtd_indefinido = qtd_animais` (histórico → INDEFINIDO)
3. `DROP COLUMN qtd_animais`
4. `ADD CONSTRAINT` CHECK cada `>= 0` e CHECK soma `>= 1`

`tier_abate`: idêntico, `qtd` → `qtd_indefinido`.

Schema Prisma atualizado para casar com o SQL.

## API

Total derivado no service. Respostas de leitura de tier/abate expõem as 3 colunas
**e** um `qtdAnimais` / `qtd` computado (total), para web e cobrança manterem o
conceito de total com churn mínimo.

| Arquivo | Mudança |
|---|---|
| `tiers/dto/create-tier.dto.ts`, `update-tier.dto.ts` | trocar `qtdAnimais` por 3 campos `@IsInt @Min(0)`; validação de soma `>= 1` |
| `abates/dto/create-abate.dto.ts` | trocar `qtd` por 3 campos `@IsInt @Min(0)`; soma `>= 1` |
| `tiers/tiers.service.ts` | create/update gravam 3 colunas; `get()` deriva `total`, `saldo`, `receita` do total; resposta inclui `qtdAnimais` computado |
| `abates/abates.service.ts` | create grava 3 colunas; respostas incluem `qtd` computado |
| `cobrancas/cobranca-calculator.ts` | `snapshotTier` / `isSnapshotStale` recebem as 3 colunas e computam `total`; `CobrancaSnapshot.qtdAnimais` continua = total |
| `cobrancas/cobrancas.service.ts` | seleciona 3 colunas ao carregar tiers p/ snapshot (nenhuma mudança de lógica de valor) |
| `credito/credito.service.ts` | `groupBy _sum` das 3 colunas em tier (aprovados) e abate (abatidos); soma para o total por proprietário |

Validação de soma `>= 1`: validador de classe custom no DTO (ex. decorator que
soma os 3 campos). Cada campo `@Min(0)`.

## Web

| Arquivo | Mudança |
|---|---|
| `features/tier/types.ts` | `Tier` e `Abate` ganham `qtdMacho/qtdFemea/qtdIndefinido`; mantêm `qtdAnimais`/`qtd` (total da API). Payloads create/update com 3 campos |
| `views/tier/AbatesView.vue` | 3 inputs (Macho/Fêmea/Indefinido) no lugar do input único; `qtd` = soma computada (aviso de consumo + submit); coluna da tabela mostra total + breakdown |
| Form criar/editar Tier (`TierListView.vue` / `TierDetailView.vue`) | 3 inputs; detalhe e lista mostram breakdown por sexo |
| Cobrança / Crédito views | lógica total-only intacta; breakdown não requerido |

## Testes

Atualizar e estender specs: `abates.service.spec`, `tiers.service.spec`,
`cobranca-calculator.spec`, `credito.service.spec`, `cobrancas.service.spec`,
`AbatesView.spec`, `queries.spec`. Casos novos:
- breakdown por sexo em create/update de tier e abate
- derivação correta do total (soma das 3 colunas)
- validação: soma `>= 1` rejeita tudo-zero; cada campo `>= 0`
- crédito/saldo/receita usam total derivado
- (referência) backfill de dados históricos → INDEFINIDO

## Critérios de aceite

- Um Tier aceita e persiste quantidades distintas por sexo; total = soma.
- Um Abate aceita e persiste quantidades distintas por sexo no mesmo registro.
- Qualquer combinação de sexos é aceita (inclusive só INDEFINIDO).
- Crédito, saldo, receita e cobrança batem com o total (comportamento atual).
- `nest build` (API) e build/testes do web passam.
