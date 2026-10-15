/**
 * Manager de uploads: o fluxo oficial de anexos do Squord.
 *
 * Anexos não vão no JSON da mensagem. O fluxo tem três passos:
 * 1. **Reservar** (`POST /uploads`): devolve o upload e um alvo assinado.
 * 2. **Enviar os bytes** com `PUT` ao alvo (fora da API do Squord, sem o
 *    header `Authorization`, repetindo os headers do alvo exatamente).
 * 3. **Confirmar** (`POST /uploads/{id}/confirm`): o Squord confere o que
 *    chegou (tipo, tamanho, primeiros bytes). Confirmar de novo devolve o
 *    mesmo resultado — a rota é idempotente.
 *
 * Depois, o `id` do upload entra em `attachmentIds` da mensagem
 * (até 10 por mensagem; cada upload só entra em uma).
 *
 * Nota: `Readable` é consumido em memória antes do `PUT`. Para arquivos
 * muito grandes, prefira passar o caminho (`path`) e confira o limite do
 * plano do Space (25 MB no gratuito; o teto da API é 500 MB).
 */

import { readFile } from "node:fs/promises";
import type { Readable } from "node:stream";
import { NetworkError, SquordTypeError } from "../errors";
import type { Logger } from "../logger";
import { noopLogger } from "../logger";
import type { RestClient } from "../rest/RestClient";
import type {
  APIUpload,
  APIUploadConfirmBody,
  APIUploadCreateBody,
  APIUploadReservation,
} from "../types/api";
import type { Snowflake } from "../types/common";

export type UploadSource = Buffer | Uint8Array | string | Readable;

export interface UploadOptions {
  /** Space do canal onde o anexo será usado. Bots sempre informam. */
  guildId: Snowflake;
  /** Nome do arquivo (1 a 256 caracteres). Padrão: nome do caminho. */
  filename?: string;
  /** Tipo de conteúdo, ex.: `image/png`. Precisa bater com os bytes. */
  contentType?: string;
  /** Caminho local do arquivo. */
  path?: string;
  /** Conteúdo em memória ou stream. */
  data?: UploadSource;
  /** Tamanho em bytes (obrigatório ao usar stream). */
  size?: number;
  /** Anula a operação. */
  signal?: AbortSignal;
}

export class UploadsManager {
  private readonly logger: Logger;

  constructor(
    private readonly rest: RestClient,
    logger?: Logger,
  ) {
    this.logger = (logger ?? noopLogger).child("uploads");
  }

  /** Reserva um upload (`POST /uploads`). Não é idempotente. */
  reserve(body: APIUploadCreateBody, signal?: AbortSignal): Promise<APIUploadReservation> {
    return this.rest.post<APIUploadReservation>("/uploads", body, {
      signal,
      retryable: false,
    });
  }

  /** Confirma um upload (`POST /uploads/{id}/confirm`). Idempotente. */
  confirm(uploadId: Snowflake, body: APIUploadConfirmBody = {}, signal?: AbortSignal): Promise<APIUpload> {
    return this.rest.post<APIUpload>(`/uploads/${uploadId}/confirm`, body, {
      signal,
      retryable: true,
    });
  }

  /**
   * Fluxo completo: reserva, envia os bytes e confirma. Devolve o upload em
   * `status: "READY"`, pronto para `attachmentIds`.
   *
   * Aceita caminho local (`path`), `Buffer`/`Uint8Array` ou `Readable`
   * (informe `size`). Streams são sempre encerrados, mesmo em falha.
   */
  async upload(options: UploadOptions): Promise<APIUpload> {
    const { path, data, signal } = options;

    let bytes: Buffer;
    let filename = options.filename;
    let size = options.size;

    if (path !== undefined) {
      bytes = await readFile(path).catch(() => {
        throw new SquordTypeError(`Não foi possível ler o arquivo: ${path}`);
      });
      filename ??= basename(path);
      size ??= bytes.length;
    } else if (data !== undefined) {
      if (typeof data === "string") {
        bytes = Buffer.from(data, "utf8");
      } else if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      } else if (typeof (data as Readable).read === "function") {
        bytes = await this.collectStream(data as Readable, signal);
      } else {
        throw new SquordTypeError("data precisa ser Buffer, Uint8Array, string ou Readable");
      }
      filename ??= "arquivo";
      size ??= bytes.length;
    } else {
      throw new SquordTypeError("Informe path ou data para o upload");
    }

    if (size === undefined || Number.isNaN(size)) {
      throw new SquordTypeError("Informe o size ao enviar um stream");
    }
    if (size <= 0) {
      throw new SquordTypeError("O arquivo está vazio (size 0)");
    }
    if (size > 524_288_000) {
      throw new SquordTypeError(
        `O arquivo passa de 500 MB (${size} bytes); o limite real vem do plano do Space`,
      );
    }
    const contentType = options.contentType ?? guessContentType(filename ?? "arquivo");

    const reservation = await this.reserve(
      { scope: "attachments", filename: filename ?? "arquivo", contentType, size, guildId: options.guildId },
      signal,
    );

    // PUT dos bytes ao alvo: fora da API do Squord, sem Authorization,
    // repetindo os headers do alvo exatamente como vieram.
    const target = reservation.target;
    const response = await this.rest.fetch(target.uploadUrl, {
      method: "PUT",
      headers: { ...target.headers },
      body: new Uint8Array(bytes),
      signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new NetworkError(
        `O envio dos bytes falhou (HTTP ${response.status})${text ? `: ${text.slice(0, 200)}` : ""}`,
      );
    }

    const upload = await this.confirm(reservation.upload.id, {}, signal);
    if (upload.status !== "READY") {
      this.logger.warn("upload confirmado fora do esperado", {
        id: upload.id,
        status: upload.status,
        scanStatus: upload.scanStatus,
      });
    }
    return upload;
  }

  /** Atalho: envia um arquivo e devolve o `id` pronto para `attachmentIds`. */
  async uploadForAttachment(options: UploadOptions): Promise<Snowflake> {
    const upload = await this.upload(options);
    return upload.id;
  }

  private async collectStream(stream: Readable, signal?: AbortSignal): Promise<Buffer> {
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of stream) {
        if (signal?.aborted) throw new DOMException("Upload cancelado", "AbortError");
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
    } catch (err) {
      stream.destroy();
      throw err;
    }
    return Buffer.concat(chunks);
  }
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || "arquivo";
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const table: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    webm: "video/webm",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    pdf: "application/pdf",
    txt: "text/plain",
    json: "application/json",
    csv: "text/csv",
    md: "text/markdown",
    zip: "application/zip",
  };
  return table[ext] ?? "application/octet-stream";
}
