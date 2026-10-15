# usage-demo

Projeto standalone que consome o `@squord/bot` **como um consumidor real faria**
(instalado de `file:../packages/bot`, sem links do workspace), para provar que o
pacote distribuído funciona de ponta a ponta.

```bash
# 1. gerar o dist do SDK (na raiz do monorepo):
pnpm build

# 2. instalar e rodar aqui:
npm install
npm start          # sem token: roda contra os mocks oficiais
```

> `file:` copia o pacote no momento do `npm install` — após rebuildar o SDK,
> rode `npm install` de novo para atualizar a cópia local.

Com um token real:

```bash
export SQUORD_BOT_TOKEN="sqb_..."
npm start          # conecta ao Squord de verdade e responde !ping
```

Para simular a instalação como no npm (tarball):

```bash
pnpm pack                       # gera packages/bot/squord-bot-<versão>.tgz
npm install ../packages/bot/squord-bot-0.1.0.tgz
```
