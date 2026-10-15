# ping-bot

O menor bot funcional do Squord: responde `!ping` com `Pong! 🏓`.

```bash
export SQUORD_BOT_TOKEN="sqb_..."   # Configurações → Desenvolvedor
npm install
node index.js
```

O bot precisa das intents `GUILDS` + `GUILD_MESSAGES` (o padrão de um bot novo)
para receber `message.created`, e da permissão `SEND_MESSAGES` no canal.
