# LandWatch - UI Design (Draft)

Este documento descreve o design alvo para o MVP e as telas principais. A descricao abaixo usa como base o briefing enviado e as imagens de referencia, mas nao e uma regra final.

## Direcao visual
- Tom geral: clean, leve, institucional, com foco em legibilidade.
- Fundo: cinza muito claro com textura sutil (mapa desbotado).
- Cards: branco, radius suave, sombra leve.
- Cor principal: verde musgo (acao primaria e destaques positivos).
- Cor neutra: cinza medio para labels e metadados.
- Cor de alerta: vermelho suave para erros e restricoes.

## Tipografia (proposta)
- Titulos: fonte display moderna (ex.: "Sora" ou "Poppins").
- Texto/labels: fonte legivel (ex.: "Inter" ou "Manrope").
- Escala: H1 28-32px, H2 22-24px, body 14-16px, helper 12-13px.

## Tokens base (sugestao)
- Primary: #4E7C4F (hover: #5B8C5C)
- Primary-contrast: #FFFFFF
- Background: #F5F6F7
- Surface: #FFFFFF
- Border: #E6E8EB
- Text: #1E1F22
- Muted: #6B7280
- Success: #2F7D32
- Warning: #D97706
- Danger: #B42318
- Radius: 10-14px
- Shadow: 0 6px 24px rgba(16, 24, 40, 0.08)

## Layout base (telas internas)
- Header fixo (56-64px) com logo, ambiente e usuario.
- Sidebar fixa (220-260px) com navegacao e destaque do item atual.
- Content area com grid de cards.
- Mobile: sidebar vira drawer/hamburger; cards empilham.

## Componentes principais
- Buttons: primary, secondary (outline), ghost.
- Inputs: text, password com toggle, select, date, checkbox.
- Badges: status (OK/Review/Restriction) + categoria.
- Tables: header fixo, zebra leve, hover.
- Cards: padrao, card de acao, card de tabela.
- Modals: cadastro de fazenda, confirmacao.
- Tabs: detalhes de fazenda (Analises/Agendamentos/Alertas).
- Chips: filtros ativos e tags de categoria.
- Map container: legenda, toggles de camadas, botao "recentrar".

---

## Tela 1: Login (Entra only)
Objetivo: entrada simples e direta, somente via Entra External ID.

### Estrutura
- Barra superior fina com logo LandWatch alinhado a esquerda.
- Card central (400px) com logo, titulo e subtitulo.
- Botao primario unico: "Entrar com conta corporativa (Entra)".
- Mensagens de erro inline e banner abaixo do botao.
- Rodape: "Acesso restrito..." e link interno (opcional).

### Estados
- Erro geral: faixa vermelha clara abaixo do botao.
- Loading: botao desabilitado + spinner.

### Responsivo
- Card ocupa 90% no mobile.
- Texto e botao com area de toque >= 44px.

---

## Tela 2: Dashboard
Objetivo: hub de navegacao e resumo.

### Estrutura
- Header com logo, ambiente, usuario e avatar.
- Sidebar com itens: Dashboard, Nova analise, Analises, Fazendas, Coordenadas, Alertas (em breve).
- Content:
  1) Headline: "Dashboard" + boas-vindas.
  2) Cards de acao rapida: Nova analise, Minhas analises, Fazendas.
  3) Tabela "Analises recentes".
  4) Lista "Fazendas acessadas recentemente".
  5) Card "Resumo 30 dias" (opcional no MVP).

### Estados
- Sem analises: empty state com CTA "Nova analise".
- Sem fazendas: empty state com CTA "Cadastrar fazenda".

---

## Tela 3: Lista de Analises
Objetivo: busca e filtro do historico.

### Estrutura
- Header de pagina com CTA "+ Nova analise".
- Card de filtros (busca, periodo, status, escopo).
- Filtros avancados (colapsavel).
- Tabela com colunas: data, id, fazenda, CAR, doc, status, intersecoes, criado por, acoes.
- Paginacao + itens por pagina.

### Estados
- Sem resultados: mensagem + "Limpar filtros".
- Loading: skeleton de linhas.

---

## Tela 4: Detalhe da Analise
Objetivo: entender intersecoes e gerar PDF.

### Estrutura
- Header com status, fazenda, CAR, bioma e acoes (Exportar PDF, Nova analise).
- Card do mapa com legenda (CAR + categorias). Base satelite (Mapbox no MVP).
- Tabela de intersecoes (categoria, dataset, feature, area, %, datas, criticidade).
- Card "Resumo da analise" (texto simples).

### Estados
- Sem intersecoes: mapa apenas com CAR + mensagem.
- Em processamento: placeholder "Analise em processamento".

---

## Tela 5: Nova Analise
Objetivo: criar analise com poucos passos.

### Estrutura
- Header + trilha de passos (1-3).
- Card "Identificacao da fazenda / CAR" com abas:
  - Selecionar fazenda cadastrada.
  - Informar dados manualmente.
  - (Futuro) Buscar por coordenadas.
- Card "Parametros da analise":
  - Data de referencia + atalhos.
  - Checkboxes de categorias.
  - Nome interno.
- Card "Revisar e gerar".
- Acoes: "Gerar analise" e "Cancelar".

### Validacoes
- Fazendas obrigatorias.
- CAR e CPF/CNPJ validos.
- Data nao pode ser futura.

---

## Tela 6: Fazendas (lista)
Objetivo: listar, filtrar e cadastrar fazendas.

### Estrutura
- Header com CTA "+ Nova fazenda".
- Card de filtros (busca, tipo, org, status, UF).
- Tabela com colunas: fazenda, CAR, doc, org, vinculo, ultima analise, situacao, acoes.
- Modal "Nova fazenda" com campos basicos.

---

## Tela 7: Detalhe da Fazenda
Objetivo: ficha completa da fazenda e historico.

### Estrutura
- Breadcrumb: Fazendas > Nome.
- Header com tags (vinculo, UF, situacao) + CTA "+ Nova analise".
- Card de informacoes gerais.
- Card de mapa (CAR + camadas com toggles). Base satelite (Mapbox no MVP).
- Tabs: Analises, Agendamentos, Alertas.

### Estados
- Sem analises: empty state + CTA.
- Sem alertas: texto simples.

---

## Diretrizes de acessibilidade
- Contraste minimo AA.
- Foco visivel em inputs e botoes.
- Alvos de toque >= 44px.
- Evitar depender apenas de cor para status.

## Observacoes
- Este documento serve como referencia para o MVP e para evolucao.
- Os textos e rotulos podem ser ajustados por usabilidade e requisitos legais.
