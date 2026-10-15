/**
 * Logger estruturado com redação automática de segredos.
 *
 * Tokens de bot (`sqb_...`) e tokens de interação são substituídos por
 * `[REDACTED]` antes de qualquer entrega. O logger nunca registra o conteúdo
 * de mensagens por conta própria: os eventos são emitidos, mas o logger só
 * fala de metadados operacionais.
 */

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Cria um logger filho com campos fixos (ex.: `rest`, `gateway`). */
  child(prefix: string): Logger;
}

/** Redação aplicada a todas as saídas do logger padrão. */
export function redact(input: string): string {
  return (
    input
      // Tokens de bot: sqb_<id>.<segredo>
      .replace(/sqb_[A-Za-z0-9._-]+/g, "sqb_[REDACTED]")
      // Header Authorization completo
      .replace(/Bot\s+sqb_[A-Za-z0-9._-]+/gi, "Bot [REDACTED]")
      // Tokens de interação que escapem em meta
      .replace(/"token"\s*:\s*"[^"]+"/g, '"token":"[REDACTED]"')
  );
}

export interface ConsoleLoggerOptions {
  /** Nível mínimo exibido. Padrão: `silent` (o SDK não imprime nada). */
  level?: LogLevel;
  /** Destino dos logs. Padrão: `console`. */
  write?: (line: string) => void;
}

export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  const level = options.level ?? "silent";
  const write = options.write ?? ((line: string) => console.log(line));

  const log =
    (lvl: Exclude<LogLevel, "silent">, prefix: string) =>
    (message: string, meta?: Record<string, unknown>) => {
      if (LEVEL_ORDER[lvl] < LEVEL_ORDER[level]) return;
      const entry = {
        t: new Date().toISOString(),
        level: lvl,
        scope: prefix || undefined,
        msg: redact(message),
        ...meta,
      };
      write(redact(JSON.stringify(entry)));
    };

  const make = (prefix: string): Logger => ({
    debug: log("debug", prefix),
    info: log("info", prefix),
    warn: log("warn", prefix),
    error: log("error", prefix),
    child: (childPrefix: string) => make(prefix ? `${prefix}:${childPrefix}` : childPrefix),
  });

  return make("");
}

/** Logger que descarta tudo. Útil como padrão e em testes. */
export const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => noopLogger,
};

/**
 * Atende por `process.env.SQUORD_LOG` (`debug|info|warn|error`) e cria o
 * logger padrão. `debug` também é habilitado por `SQUORD_DEBUG=1`.
 */
export function loggerFromEnv(): Logger {
  const fromEnv = (process.env.SQUORD_LOG ?? "").toLowerCase();
  if (fromEnv in LEVEL_ORDER) {
    return createConsoleLogger({ level: fromEnv as LogLevel });
  }
  if (process.env.SQUORD_DEBUG === "1" || process.env.SQUORD_DEBUG === "true") {
    return createConsoleLogger({ level: "debug" });
  }
  return noopLogger;
}
