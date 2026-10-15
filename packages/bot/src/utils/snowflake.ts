/**
 * Validação e manipulação de ids do Squord.
 *
 * Ids são strings opacas: Snowflakes decimais de até 20 dígitos, ou o formato
 * antigo de 24 caracteres hexadecimais. Nunca converta para `number`.
 */

import { SquordTypeError } from "../errors";

const SNOWFLAKE_RE = /^\d{1,20}$/;
const LEGACY_ID_RE = /^[0-9a-f]{24}$/i;

/** Verifica se um valor parece um id válido do Squord. */
export function isValidSnowflake(id: string): boolean {
  return typeof id === "string" && (SNOWFLAKE_RE.test(id) || LEGACY_ID_RE.test(id));
}

/** Lança `SquordTypeError` se o id não tiver o formato de id do Squord. */
export function assertSnowflake(id: string, label = "id"): string {
  if (!isValidSnowflake(id)) {
    throw new SquordTypeError(
      `${label} inválido: ${JSON.stringify(id)} — ids do Squord são strings (Snowflake decimal ou hex de 24 caracteres)`,
    );
  }
  return id;
}

/** Compara dois ids por ordem numérica (seguro com ids grandes, via BigInt). */
export function compareSnowflakes(a: string, b: string): number {
  if (!SNOWFLAKE_RE.test(a) || !SNOWFLAKE_RE.test(b)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  try {
    const ba = BigInt(a);
    const bb = BigInt(b);
    return ba < bb ? -1 : ba > bb ? 1 : 0;
  } catch {
    return a.localeCompare(b);
  }
}
