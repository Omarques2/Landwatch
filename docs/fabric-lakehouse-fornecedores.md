# Integracao Fabric Lakehouse para aba Fornecedores

## Objetivo
Documentar a estrategia tecnica para leitura e escrita dos dados das tabelas `Fornecedores` e `gta_pendencias` no Microsoft Fabric Lakehouse, usada pela nova aba `Fornecedores` do LandWatch.

## Resultado da pesquisa (fontes oficiais Microsoft)

### 1) Leitura: SQL analytics endpoint do Lakehouse
- O Lakehouse expõe um SQL analytics endpoint com `connectionString` e `id` acessiveis via API de metadados do item Lakehouse.
- A API usada para descobrir esses metadados e `GET /v1/workspaces/{workspaceId}/lakehouses/{lakehouseId}`.
- Para consultar os dados de `Fornecedores` e `gta_pendencias`, o backend abre conexao TDS (porta 1433) contra o endpoint e executa SELECTs paginados/agregados.

### 2) Escrita: NAO usar DML direto no SQL endpoint
- O SQL analytics endpoint e orientado a consulta; operacoes de escrita (INSERT/UPDATE/DELETE) nao sao suportadas nesse endpoint.
- Para atualizar `car` no Lakehouse, a estrategia adotada e disparar job Spark/Notebook no Fabric (Job Scheduler REST API), que aplica a atualizacao na tabela Delta.
- Depois da escrita, e recomendado disparar refresh de metadados do SQL endpoint para reduzir janela de inconsistência de leitura.

### 3) Autenticacao e autorizacao
- O backend usa Service Principal (Entra ID) para chamar Fabric REST API e para autenticar no endpoint SQL.
- Para Service Principal em Fabric, e necessario habilitar o tenant setting e conceder permissao no workspace.
- Observacao operacional: o primeiro token de Service Principal pode falhar sem inicializacao; a documentacao orienta realizar uma chamada inicial de bootstrap.

### 4) Consistencia e performance
- Existe sincronizacao entre Delta tables e SQL endpoint; alteracoes podem nao aparecer instantaneamente nas consultas T-SQL.
- No frontend, a UX deve assumir consistencia eventual: apos salvar CAR, recarregar indicadores/lista e informar ao usuario que a refletancia pode levar alguns instantes.
- Para bom desempenho no SQL endpoint: evitar `SELECT *`, limitar colunas, usar filtros seletivos e reduzir scans desnecessarios.

## Decisao de arquitetura no LandWatch

### Fluxo de leitura
1. Backend resolve metadados do Lakehouse (`connectionString`, `databaseName`, `sqlEndpointId`).
2. Backend conecta no SQL endpoint (TDS) via Service Principal.
3. Endpoints expostos:
   - `GET /v1/fornecedores/summary`
   - `GET /v1/fornecedores`
   - `GET /v1/fornecedores/:id/gta-pendencias`

### Fluxo de escrita (CAR)
1. Frontend abre modal por duplo clique e envia `PATCH /v1/fornecedores/:id/car`.
2. Backend dispara job Spark/Notebook no Fabric via `run-on-demand item job`.
3. Backend (best-effort) solicita refresh de metadados do SQL endpoint.
4. Frontend recarrega indicadores/lista/drill-down.

### Contrato de parametros enviado ao job `RunNotebook`
- `action` = `update_fornecedor_car`
- `id_fornecedor` = id do fornecedor selecionado
- `car` = CAR informado no modal (normalizado em maiusculo)
- `requested_by` = `sub` do usuario logado na API (ou null)

Notebook pronto para importacao:
- `docs/notebooks/fabric/update_fornecedor_car_lakehouse.ipynb`

## Variaveis de ambiente adicionadas (apps/api)
- `FABRIC_API_BASE_URL`
- `FABRIC_TENANT_ID`
- `FABRIC_CLIENT_ID`
- `FABRIC_CLIENT_SECRET`
- `FABRIC_WORKSPACE_ID`
- `FABRIC_LAKEHOUSE_ID`
- `FABRIC_LAKEHOUSE_SQL_CONNECTION_STRING` (opcional, fallback)
- `FABRIC_LAKEHOUSE_SQL_DATABASE` (opcional, fallback)
- `FABRIC_LAKEHOUSE_SQL_SCHEMA`
- `FABRIC_SQL_QUERY_DRIVER` (`mssql_tedious` | `sqlclient_bridge`)
- `FABRIC_CAR_UPDATE_MODE` (`disabled` | `spark_job`)
- `FABRIC_CAR_UPDATE_ITEM_ID`
- `FABRIC_CAR_UPDATE_JOB_TYPE` (para notebook: `RunNotebook`)
- `FABRIC_CAR_UPDATE_WAIT_SECONDS`
- `FABRIC_CAR_UPDATE_POLL_INTERVAL_MS`

## Plano de migracao incremental (sem interrupcao)
1. **Fase 1 (hotfix local)**: usar `FABRIC_SQL_QUERY_DRIVER=sqlclient_bridge` para bypass do `tedious` em ambiente Windows/local (requer PowerShell + .NET `System.Data.SqlClient`).
2. **Fase 2 (validacao)**: monitorar latencia/erros dos endpoints `GET /v1/fornecedores/*` por alguns dias.
3. **Fase 3 (padronizacao)**: decidir driver definitivo para producao (ODBC/SqlClient service) e manter `mssql_tedious` apenas como fallback.
4. **Fase 4 (cleanup)**: apos estabilidade, remover o fallback que nao for utilizado.

## Pontos de decisao pendentes
1. Definir notebook/job oficial de escrita de CAR (item id, parametros e tratamento de erro padrao).
2. Definir validacao de formato de CAR (estrita SICAR vs texto nao vazio).
3. Definir SLA de refletancia no SQL endpoint (ex: alvo de ate 60s) para UX e monitoração.

## Referencias oficiais utilizadas
- Get Lakehouse (REST): https://learn.microsoft.com/en-us/rest/api/fabric/lakehouse/items/get-lakehouse
- Query SQL analytics endpoint: https://learn.microsoft.com/en-us/fabric/data-warehouse/lakehouse-sql-analytics-endpoint
- SQL endpoint / OneLake security (limites de escrita): https://learn.microsoft.com/en-us/fabric/onelake/sql-analytics-endpoint-onelake-security
- Connectivity for data warehousing items: https://learn.microsoft.com/en-us/fabric/data-warehouse/connectivity
- Service principals no Fabric Warehouse/Lakehouse: https://learn.microsoft.com/en-us/fabric/data-warehouse/service-principals
- Run on-demand item job (REST): https://learn.microsoft.com/en-us/rest/api/fabric/core/job-scheduler/run-on-demand-item-job
- Get item job instance (REST): https://learn.microsoft.com/en-us/rest/api/fabric/core/job-scheduler/get-item-job-instance
- SQL endpoint performance recommendations: https://learn.microsoft.com/en-us/fabric/data-warehouse/sql-analytics-endpoint-performance
