# Seleção múltipla de feições no mapa de análise

## Objetivo

Permitir selecionar até 20 feições temáticas no mapa de uma análise e encaminhar
o conjunto para a tela de Anexos, sem alterar MVT, API ou banco.

## Interação

- Clique normal em uma feição substitui a seleção atual pela feição clicada.
- Clique normal fora de feições limpa a seleção.
- `Ctrl` + clique ou `Meta` + clique alterna somente a feição clicada:
  adiciona quando ausente e remove quando já selecionada.
- Em área com sobreposição, o seletor existente continua listando as feições.
  A escolha na lista aplica o modificador usado no clique que abriu a lista.
- O limite é 20 feições. Tentativa de adicionar a vigésima primeira mantém a
  seleção atual e mostra toast informativo.
- Não haverá barra flutuante de seleção no mapa.

## Encaminhamento para Anexos

- Clique direito continua abrindo o menu existente `Ir para Anexos`.
- Quando houver seleção múltipla, a ação envia todas as feições selecionadas.
- Quando houver uma única seleção, a ação envia essa feição.
- Quando a feição aberta por clique direito não fizer parte da seleção atual, a
  ação preserva o comportamento unitário existente e envia somente essa feição.
- A rota usa parâmetros `target` repetidos no formato
  `<datasetCode>:<featureId>`.
- A tela de Anexos continua aceitando `datasetCode` + `featureId` antigos para
  compatibilidade e passa a hidratar `selectedTargets` com os parâmetros
  `target`.

## Estrutura

- `apps/web/src/features/analyses/analysis-vector-map.ts`
  concentra helpers puros: chave, atualização da coleção limitada e filtro
  MapLibre para múltiplas feições.
- `apps/web/src/components/maps/AnalysisVectorMap.vue`
  integra eventos MapLibre, preserva modificadores no seletor de sobreposição,
  atualiza destaque e emite menu de contexto com seleção efetiva.
- `apps/web/src/features/attachments/query-state.ts`
  serializa e desserializa alvos repetidos.
- `apps/web/src/views/AnalysisDetailView.vue`
  encaminha os alvos do menu para `/attachments`.
- `apps/web/src/views/AttachmentsView.vue`
  hidrata os alvos recebidos na coleção já existente.

## Tratamento de erros

- Alvos inválidos na query são ignorados.
- Alvos repetidos são deduplicados.
- Mais de 20 alvos recebidos pela URL são truncados para 20.
- Tentativa interativa de exceder 20 itens mostra toast `info`.

## Testes

- Helpers do mapa: substituição por clique normal, toggle com modificador,
  remoção, limite e filtro MapLibre múltiplo.
- Query state: parse/build de `target` repetido, deduplicação, descarte de
  inválidos e compatibilidade singular.
- View de análise: rota unitária existente e rota múltipla pelo menu direito.
- View de Anexos: hidratação de `selectedTargets` recebidos pela rota.
- Verificação final: testes focados, suíte web, `typecheck`, `build` e
  `git diff --check`.
