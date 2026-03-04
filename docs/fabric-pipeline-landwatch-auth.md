# Fabric Pipeline: Token da Sigfarm Auth para Notebook LandWatch

O notebook suporta dois modos:

1. `sigfarm_refresh_token` (recomendado): o notebook busca `refreshToken` e faz `POST /v1/auth/refresh` sozinho.
2. `static_token`: o pipeline injeta `LANDWATCH_API_TOKEN` já com `accessToken`.

## Pré-requisitos

- Secret no Key Vault contendo o refresh token da conta de serviço.
- Permissão do pipeline para ler o Key Vault.
- Notebook configurado com:
  - `LANDWATCH_AUTH_MODE = "sigfarm_refresh_token"` (ou `static_token`)
  - Se `sigfarm_refresh_token`: `LANDWATCH_REFRESH_TOKEN_KEYVAULT_URI` e `LANDWATCH_REFRESH_TOKEN_SECRET_NAME`
  - Se `static_token`: `LANDWATCH_API_TOKEN`

## Modo recomendado (pipeline só passa INPUT_JSON)

Configure no notebook:

- `LANDWATCH_AUTH_MODE = "sigfarm_refresh_token"`
- `SIGFARM_AUTH_API_BASE_URL = "https://api-auth.sigfarmintelligence.com"`
- `LANDWATCH_REFRESH_TOKEN_KEYVAULT_URI = "https://<seu-kv>.vault.azure.net/"`
- `LANDWATCH_REFRESH_TOKEN_SECRET_NAME = "<secret-name-do-refresh-token>"`

Assim o pipeline pode continuar passando apenas `INPUT_JSON`.

## Sequência de atividades no pipeline

1. `Get_RefreshToken` (Key Vault / Get Secret)
- Secret name: `sigfarm-auth-refresh-token` (ou o nome adotado no ambiente).

2. `Refresh_AccessToken` (Web activity)
- Method: `POST`
- URL: `https://api-auth.sigfarmintelligence.com/v1/auth/refresh`
- Headers:
```json
{
  "Content-Type": "application/json"
}
```
- Body (dinâmico):
```json
{
  "refreshToken": "@{activity('Get_RefreshToken').output.value}"
}
```

3. `Run_LandWatch_Notebook` (Notebook activity, modo `static_token`)
- Base parameters:
  - `LANDWATCH_AUTH_MODE`: `static_token`
  - `LANDWATCH_API_TOKEN`: `@{activity('Refresh_AccessToken').output.body.data.accessToken}`
  - `INPUT_JSON`: payload normal já usado no pipeline

## Validação rápida

Depois de publicar:

1. Execute o pipeline manualmente com 1 registro de teste.
2. Verifique que o notebook não falha em `validate_landwatch_auth`.
3. Em caso de erro 401, confirme se a expressão do token está retornando `data.accessToken` (e não o objeto inteiro).

## Observações

- O notebook também aceita `LANDWATCH_API_TOKEN` como JSON completo contendo `data.accessToken`, mas o recomendado é injetar diretamente o token final.
- Não persistir `refreshToken` nem `accessToken` em logs.
