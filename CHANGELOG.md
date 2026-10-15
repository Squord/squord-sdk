# Changelog

As mudanças notáveis deste projeto ficam documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
versionamento é [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] — 2026-10-15

Primeira versão do SDK oficial de bots do Squord, alinhada à API v1 e ao
protocolo do gateway documentados em <https://docs.squord.com.br>.

### Adicionado

- **`SquordClient`**: login (validação via `GET /bots/@me`), ciclo de vida,
  eventos tipados com os nomes reais do gateway, presença, encerramento
  gracioso (`SIGINT`/`SIGTERM`) e modo `restOnly` (sem gateway, para tarefas
  agendadas e CI).
- **REST tipado**: `x-request-id`, timeout, `AbortSignal`, paginação por
  cursor, teto global conservador, observância dos headers `X-RateLimit-*`,
  espera de `details.retryAfter` no 429 e retentativas apenas em operações
  idempotentes ou protegidas por `nonce`.
- **Gateway**: protocolo completo (`hello`/`identify`/`ready`/`heartbeat`/
  `heartbeat.ack`/`resume`/`resumed`/`invalid_session`/`reconnect`),
  reconexão com backoff exponencial e jitter, detecção de conexão zumbi,
  deduplicação por sequência `s` e tratamento fiel dos códigos de fechamento
  (4004/4013/4014 sem retomada).
- **Mensagens**: enviar, responder, editar, apagar, reagir, fixar, histórico
  paginado, `nonce` automático (idempotência) e menções seguras por padrão.
- **Comandos**: texto com prefixo (aliases, argumentos com aspas, cooldowns,
  middleware), comandos de barra com sincronização `PUT` em bloco no login e
  handlers de componentes por `customId`.
- **Interações**: `reply`, `replyEphemeral`, `defer` + `followup`, `update` e
  `acknowledge`, com acesso tipado às opções.
- **Builders validados**: `EmbedBuilder`, `ActionRowBuilder`, `ButtonBuilder`,
  `SelectMenuBuilder` — limites reais da plataforma conferidos antes de
  gastar chamadas.
- **Membros, cargos e moderação**: consulta, listagem com filtros, edição,
  expulsão, banimento com remoção de histórico, timeout e cargos.
- **Uploads**: fluxo oficial de 3 passos (reserva → `PUT` dos bytes →
  confirmação idempotente), abstraído em uma chamada.
- **Permissões**: 43 flags em `BigInt`, conversão de/para string decimal e
  resolução local de overwrites seguindo o algoritmo oficial.
- **Cache opcional** com TTL e limite de itens; **logger** estruturado com
  redação automática de tokens.
- **`@squord/sdk/testing`**: `MockGateway` (fala o protocolo real em memória),
  `MockRest`, `createMockEnvironment` e `fixtures` com payloads da documentação.
- Documentação em português (README + guias), 90 testes (unit + integração),
  build ESM/CJS e 4 exemplos de bots.
