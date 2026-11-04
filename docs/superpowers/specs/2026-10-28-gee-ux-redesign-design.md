# /gee — redesign de UX/UI

Data: 2026-10-28. Escopo: só frontend (`apps/web`). Backend, scripts Earth Engine, `runGeeCarAnalysis` e `gee.ts` não mudam.

## Decisões

| Tema | Decisão |
|------|---------|
| Layout | Abas no topo (Imagem Sentinel-2 / Mudança de vegetação). Em `lg`: painel lateral (~360px) com formulário + área de resultado larga. Empilha no celular. |
| Área | Alternador `Arquivo \| Fazenda` (`PillToggle`). Arquivo: dropzone. Fazenda: um campo com busca enquanto digita (`GET /v1/farms?q=`, debounce 300ms), resultados abaixo com nome, CAR e organização. Seleção vira um cartão com "Trocar". Área é compartilhada entre as abas; trocar a área limpa os resultados. Nunca envia arquivo e fazenda juntos; trocar de modo limpa a seleção. |
| Datas | Campo digitável DD/MM/AAAA (máscara, valor ISO `YYYY-MM-DD`) + botão que abre o calendário nativo (`showPicker`, com min/max). Atalhos 30 dias / 3 meses / 12 meses na aba Sentinel-2. Datas separadas por aba. |
| Data final | Continua exclusiva. Rótulo "Fim (não incluso)". Valor enviado = valor digitado. |
| Sensores | Aba vegetação mostra linha do tempo Landsat 5 / Landsat 8 com o trecho usado por cada um; o sensor faltante fica em vermelho + frase curta. Validações atuais preservadas. |
| Progresso | Lista de etapas reais (mapeadas de `stage`), ✓ / spinner / pendente, contagens na etapa em que surgem, tempo decorrido, `<progress>` indeterminado, botão Cancelar (aborta a requisição no navegador). |
| Comparação | Antes/depois lado a lado com zoom e arraste sincronizados (roda, pinça, +/−/⟲), tela cheia, opacidade 0–100% (padrão 35%) só na sobreposição. |
| Textos | Sem nomes de script nem parágrafos técnicos. Visível: legenda de cores, "mediana do período" nos rótulos, aviso de resolução reduzida. Ressalvas em "Como interpretar" recolhido (`<details>`). |
| Área SAVI | m² + ha (ha só exibição). |
| Resultados | Cada aba guarda o seu; abas travadas durante execução. |

## Componentes (`src/components/gee/`)

- `GeeAreaPicker.vue` — v-model `file` e `farm`; dono da busca de fazendas e do dropzone.
- `GeeDateInput.vue` — v-model ISO; `min`/`max` repassados ao calendário nativo. Data incompleta/inválida emite `""`.
- `GeeSensorTimeline.vue` — props `start`, `end`, `today`.
- `GeeCompareViewer.vue` — props com as 3 URLs (aceitam data URLs) e legendas; emite `settled(layer, ok)` para o `GeeView` manter o carregamento até as 3 camadas assentarem.

`GeeView.vue` mantém: validação de período, `AbortController`, timers e limpeza no unmount, tratamento de erros da API, `runGeeCarAnalysis` com o mesmo contrato.

## Interpretação (não muda)

Não usar "desmatamento detectado"/"área desmatada". Escala e cores do SAVI intactas. "Como interpretar" lista: imagens são medianas, não confirma desmatamento, SAVI inteiro perde frações, amarelo ≠ sem mudança, zero possível mesmo com redução, limite de 32 MB / 10.000 px do GeoTIFF.

## Testes

`GeeView.test.ts` atualizado para novos seletores, mantendo todas as verificações: progresso até as camadas assentarem (load/error), opacidade só na sobreposição, aviso de resolução, períodos efetivos, erro de API, bloqueio de sensores, min do calendário. Novos: seleção de fazenda envia só `farmId`; resultado por aba; cancelamento; `GeeDateInput` (máscara, inválida); `GeeCompareViewer` (zoom sincronizado). `gee.spec.ts` inalterado.

## Adendo — prévia Sentinel-2 e download (aprovado em 2026-10-28)

- Exceção aprovada ao "só frontend": `run_image.cjs` passa a devolver `previewUrl`/`previewDimensions` da aba Sentinel-2, renderizando com `renderPreviews` a mesma imagem que o script exporta (`composite.visualize(trueColorVis)`). Só exibição; script intacto. Tipo em `gee.service.ts` e `gee.ts` atualizado.
- Aba Sentinel-2 mostra a imagem no mesmo visualizador com zoom; carregamento termina quando a prévia assenta.
- `GeeDownloadButton`: `fetch` direto (sem headers de auth do app) com progresso real em bytes; falha oferece o link direto.
- Aba Sentinel-2 passa a escolher **um mês** (`GeeMonthPicker`: dois selects Mês + Ano numa linha, meses futuros desabilitados, anos desde 2017). Período enviado: 1º do mês → 1º do mês seguinte (exclusivo), como o uso original do script. Padrão: mês anterior. Datas livres e atalhos removidos dessa aba; aba de vegetação inalterada.
- Linha do tempo de sensores removida a pedido: períodos efetivos aparecem nas legendas do resultado; falta de sensor segue explicada pela mensagem de erro.
- Sentinel-2 aceita uma segunda data ("+ Adicionar data para comparar", padrão: mesmo mês do ano anterior). Os dois meses rodam **em paralelo** (duas chamadas independentes de `runGeeCarAnalysis`, mesmo `AbortController`); resultado aparece quando ambas terminam, mais antigo à esquerda, zoom sincronizado, um download por mês. Falha de um mês mostra o outro e nomeia a falha. Meses iguais bloqueados.
- Layout revisado: controles (Área, Data/Período, botão) numa barra horizontal no topo; resultado ocupa a largura toda abaixo (container até 1600px). Substitui o painel lateral.
