# Backlog superficial - análises, anexos, sidebar e validade

Data: 2026-05-06

Objetivo deste documento: registrar problemas reportados, impacto percebido e áreas prováveis do código para futura correção. Esta análise é superficial e não valida solução final.

## 1. `/analyses/` não permite selecionar múltiplas áreas para levar para `/attachments`

- Problema: hoje o fluxo aparenta privilegiar apenas a área/análise atualmente selecionada, dificultando um fluxo de trabalho em lote para anexos.
- Impacto: operador perde tempo repetindo navegação e seleção unitária.
- Sinal no código:
  - [apps/web/src/views/AnalysesView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysesView.vue)
  - [apps/web/src/views/AttachmentsView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AttachmentsView.vue)
  - [apps/web/src/features/attachments/api.ts](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/api.ts)
- Observação inicial: já existe estrutura de seleção em anexos (`selectedTargets`) e também API para seleção filtrada, então a lacuna parece mais de UX/orquestração entre telas do que ausência total de base técnica.
- Ponto para futuro: definir se a seleção múltipla acontece em cards/tabela de análises, no mapa, ou via ação em lote antes de entrar em anexos.

## 2. `/attachments` dificulta localizar áreas pequenas; falta um mecanismo de `Selecionar todos`

- Problema: áreas pequenas no mapa são difíceis de clicar manualmente.
- Impacto: perda de produtividade e chance de erro operacional.
- Sinal no código:
  - [apps/web/src/features/attachments/components/AttachmentsExploreWorkspace.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/components/AttachmentsExploreWorkspace.vue)
  - [apps/web/src/features/attachments/components/AttachmentsVectorMap.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/components/AttachmentsVectorMap.vue)
- Observação inicial: já existe badge visual com total de feições e já existe seleção múltipla (`selectedTargets`). Isso indica bom ponto de apoio para adicionar ação de seleção em lote perto do contador.
- Ponto para futuro: definir se `Selecionar todos` respeita filtro atual, viewport atual, dataset atual ou resultado completo da busca.

## 3. Sidebar colapsada usa tooltip nativo lento e visualmente fraco

- Problema: no menu lateral colapsado, a ajuda visual depende de `title`, que demora e tem aparência nativa inconsistente.
- Impacto: navegação pior, descoberta de itens mais lenta, UX fraca.
- Sinal no código:
  - [apps/web/src/components/SidebarNav.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/components/SidebarNav.vue)
  - [apps/web/src/components/SidebarContent.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/components/SidebarContent.vue)
- Observação inicial: os componentes atuais usam `:title="collapsed ? ... : ''"` em vários botões. Isso confirma a origem do comportamento relatado.
- Ponto para futuro: trocar para tooltip própria com abertura rápida, acessível por hover/focus e consistente com o design system.

## 4. Download ZIP de anexos gera duplicidade quando o mesmo anexo está ligado a mais de uma área

- Problema: ao baixar ZIP de anexos da análise, o mesmo arquivo entra repetido quando está associado a múltiplas feições.
- Impacto: ZIP poluído, tamanho maior, ambiguidade para o usuário.
- Exemplo reportado:
  - [análise 37fa4c43-5470-4489-8c4c-f182e9eac653](https://testlandwatch.sigfarmintelligence.com/analyses/37fa4c43-5470-4489-8c4c-f182e9eac653)
- Sinal no código:
  - [apps/api/src/attachments/attachments.service.ts](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/api/src/attachments/attachments.service.ts)
  - [apps/api/src/attachments/public-attachments.controller.ts](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/api/src/attachments/public-attachments.controller.ts)
  - [apps/api/src/attachments/attachments.controller.ts](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/api/src/attachments/attachments.controller.ts)
- Observação inicial: o problema provavelmente está no empacotamento do ZIP no backend, por falta de deduplicação por anexo/blob/hash antes de adicionar os arquivos.
- Ponto para futuro: decidir critério de unicidade no ZIP (`attachment.id`, `sha256`, blob path ou combinação com nome lógico).

## 5. Botões em geral não comunicam bem estado de carregamento/navegação

- Problema: vários botões parecem aceitar clique sem feedback claro, especialmente download e navegação.
- Impacto: sensação de travamento, clique repetido, UX inconsistente.
- Sinal no código:
  - [apps/web/src/views/AnalysisDetailView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysisDetailView.vue)
  - [apps/web/src/views/AnalysisPublicView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysisPublicView.vue)
  - [apps/web/src/views/AnalysisPrintView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysisPrintView.vue)
  - [apps/web/src/views/AnalysesView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysesView.vue)
  - [apps/web/src/components/SidebarNav.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/components/SidebarNav.vue)
  - [apps/web/src/components/SidebarContent.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/components/SidebarContent.vue)
- Observação inicial: já existem alguns pontos com `loading`, `aria-busy` e spinner, mas o padrão ainda não está disseminado de forma uniforme pela aplicação.
- Ponto para futuro: mapear ações assíncronas e padronizar estados `idle/loading/success/error`, inclusive desabilitar clique repetido quando fizer sentido.

## 6. Anexos revogados precisam afetar visualização, download público e validade da análise

- Problema: quando a análise tem anexos revogados, faltam regras claras e visíveis de invalidação na área pública, interna e no PDF.
- Comportamento desejado relatado:
  - modal de anexos continua visível
  - anexos revogados aparecem sinalizados
  - download público dos anexos revogados deve ser bloqueado
  - área pública e área interna devem sinalizar que a análise perdeu validade
  - impressão/PDF deve receber marca d'água indicando perda de validade
- Impacto: risco de uso indevido de análise inválida e falta de clareza jurídica/operacional.
- Sinal no código:
  - [apps/web/src/views/AnalysisPublicView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysisPublicView.vue)
  - [apps/web/src/views/AnalysisDetailView.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/views/AnalysisPrintView.vue)
  - [apps/web/src/components/analyses/AnalysisPrintLayout.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/components/analyses/AnalysisPrintLayout.vue)
  - [apps/web/src/features/attachments/components/AttachmentsAttachmentDetailDialog.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/components/AttachmentsAttachmentDetailDialog.vue)
  - [apps/web/src/features/attachments/components/AttachmentsFeaturePanel.vue](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/components/AttachmentsFeaturePanel.vue)
  - [apps/web/src/features/attachments/types.ts](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/web/src/features/attachments/types.ts)
  - [apps/api/src/attachments](/C:/Users/Sigfarm/Desktop/Github/LandWatch/apps/api/src/attachments)
- Observação inicial: o domínio de anexos já conhece status `REVOKED`, então a base semântica já existe. O que parece faltar é propagar essa semântica para o contexto de validade da análise e para fluxos públicos/PDF.
- Ponto para futuro: definir regra de negócio exata.
  - Um anexo revogado invalida toda análise ou só certos cenários?
  - Bloqueio público vale para arquivo individual, ZIP, ou ambos?
  - A invalidação depende de existir ao menos um anexo aprovado restante?

## Observações gerais

- Os temas acima misturam:
  - UX pura
  - regra de negócio
  - comportamento backend
  - consistência entre área autenticada, pública e impressão
- Antes de implementar, vale quebrar em épicos menores:
  - seleção e produtividade em anexos
  - feedback visual e padrões de loading
  - revogação e validade da análise
  - deduplicação de ZIP no backend
