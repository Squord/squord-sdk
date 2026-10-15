/** Utilitários gerais. */

import { randomUUID } from "node:crypto";

/** Gera um id de requisição (rastreável no header `x-request-id`). */
export function newRequestId(): string {
  return randomUUID();
}

/** Gera uma chave de idempotência (`nonce`) para envio de mensagens. */
export function newNonce(): string {
  return randomUUID().replace(/-/g, "").slice(0, 32);
}

/** Verifica se um valor parece um token de bot do Squord (`sqb_<id>.<segredo>`). */
export function isBotToken(token: string): boolean {
  return typeof token === "string" && /^sqb_.+\..+/.test(token);
}

/** Remove o prefixo `Bot ` de um token, se presente. */
export function stripTokenPrefix(token: string): string {
  return token.startsWith("Bot ") ? token.slice(4) : token;
}

/** Divide argumentos de uma linha de comando, respeitando aspas. */
export function splitArguments(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes: '"' | "'" | null = null;

  for (const char of input) {
    if (inQuotes) {
      if (char === inQuotes) {
        inQuotes = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inQuotes = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

/** Delega em `setTimeout` agendável (usado para avançar relógio em testes). */
export const timers = {
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (id: NodeJS.Timeout) => clearTimeout(id),
};
