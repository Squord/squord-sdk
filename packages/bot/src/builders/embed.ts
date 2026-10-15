/**
 * `EmbedBuilder`: cria embeds tipados com validação local dos limites reais
 * da plataforma (antes de gastar uma chamada com um `422 VALIDATION_FAILED`).
 *
 * Limites do Squord: 10 embeds por mensagem, 25 campos por embed, título 256,
 * descrição 4096, nome de campo 256, valor de campo 1024, rodapé 2048,
 * autor 256 e 6000 caracteres somando o texto dos embeds da mensagem.
 */

import { SquordTypeError } from "../errors";
import type { APIEmbed, APIEmbedInput } from "../types/api";

export const EmbedLimits = {
  EmbedsPerMessage: 10,
  FieldsPerEmbed: 25,
  Title: 256,
  Description: 4096,
  FieldName: 256,
  FieldValue: 1024,
  FooterText: 2048,
  AuthorName: 256,
  TotalTextPerMessage: 6000,
} as const;

interface EmbedFieldInput {
  name: string;
  value: string;
  inline?: boolean;
}

export interface EmbedAuthorInput {
  name: string;
  url?: string | null;
  iconUrl?: string | null;
}

export interface EmbedFooterInput {
  text: string;
  iconUrl?: string | null;
}

/** Converte cores: `#rrggbb` → inteiro, inteiro → `#rrggbb`. */
export function normalizeEmbedColor(color: number | string): number {
  if (typeof color === "number") {
    if (!Number.isInteger(color) || color < 0 || color > 0xff_ff_ff) {
      throw new SquordTypeError(
        `Cor de embed inválida: ${color} — use um inteiro de 0 a 16777215 ou "#rrggbb"`,
      );
    }
    return color;
  }
  const trimmed = color.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new SquordTypeError(`Cor de embed inválida: ${JSON.stringify(color)} — use "#rrggbb"`);
  }
  return Number.parseInt(hex, 16);
}

export class EmbedBuilder {
  private titleValue: string | null = null;
  private descriptionValue: string | null = null;
  private urlValue: string | null = null;
  private colorValue: number | null = null;
  private timestampValue: string | null = null;
  private authorValue: EmbedAuthorInput | null = null;
  private footerValue: EmbedFooterInput | null = null;
  private imageValue: string | null = null;
  private thumbnailValue: string | null = null;
  private fieldsValue: EmbedFieldInput[] = [];

  /** Título do embed (até 256 caracteres). */
  setTitle(title: string): this {
    assertLength("title", title, EmbedLimits.Title);
    this.titleValue = title;
    return this;
  }

  /** Descrição (até 4096 caracteres). */
  setDescription(description: string): this {
    assertLength("description", description, EmbedLimits.Description);
    this.descriptionValue = description;
    return this;
  }

  /** URL do título (só `http://` ou `https://`). */
  setURL(url: string): this {
    assertHttpUrl("url", url);
    this.urlValue = url;
    return this;
  }

  /** Cor: inteiro de 0 a 16777215 ou `#rrggbb`. */
  setColor(color: number | string): this {
    this.colorValue = normalizeEmbedColor(color);
    return this;
  }

  /** Momento exibido no rodapé. Um `Date` ou string ISO 8601 com fuso. */
  setTimestamp(timestamp: Date | string = new Date()): this {
    this.timestampValue =
      timestamp instanceof Date ? timestamp.toISOString() : timestamp;
    return this;
  }

  /** Autor exibido no topo (nome até 256 caracteres). */
  setAuthor(author: EmbedAuthorInput | null): this {
    if (author) {
      assertLength("author.name", author.name, EmbedLimits.AuthorName);
      if (author.url) assertHttpUrl("author.url", author.url);
    }
    this.authorValue = author;
    return this;
  }

  /** Rodapé (texto até 2048 caracteres). */
  setFooter(footer: EmbedFooterInput | null): this {
    if (footer) {
      assertLength("footer.text", footer.text, EmbedLimits.FooterText);
    }
    this.footerValue = footer;
    return this;
  }

  /** Imagem principal (baixada e hospedada pelo Squord em segundo plano). */
  setImage(url: string): this {
    this.imageValue = url;
    return this;
  }

  /** Miniatura. */
  setThumbnail(url: string): this {
    this.thumbnailValue = url;
    return this;
  }

  /** Adiciona um campo (nome até 256, valor até 1024). */
  addField(name: string, value: string, inline = false): this {
    return this.addFields({ name, value, inline });
  }

  /** Adiciona vários campos. */
  addFields(...fields: EmbedFieldInput[]): this {
    if (this.fieldsValue.length + fields.length > EmbedLimits.FieldsPerEmbed) {
      throw new SquordTypeError(
        `Um embed aceita no máximo ${EmbedLimits.FieldsPerEmbed} campos`,
      );
    }
    for (const field of fields) {
      assertLength("field.name", field.name, EmbedLimits.FieldName);
      assertLength("field.value", field.value, EmbedLimits.FieldValue);
      this.fieldsValue.push(field);
    }
    return this;
  }

  /** Remove todos os campos. */
  clearFields(): this {
    this.fieldsValue = [];
    return this;
  }

  /** Payload pronto para o campo `embeds` (só campos preenchidos). */
  build(): APIEmbedInput {
    if (
      !this.titleValue &&
      !this.descriptionValue &&
      !this.imageValue &&
      !this.thumbnailValue &&
      this.fieldsValue.length === 0 &&
      !this.footerValue &&
      !this.authorValue
    ) {
      throw new SquordTypeError(
        "O embed não tem nada visível: defina título, descrição, campos, imagem ou rodapé (o Squord recusa embeds vazios com BLANK)",
      );
    }
    const embed: APIEmbedInput = {};
    if (this.titleValue) embed.title = this.titleValue;
    if (this.descriptionValue) embed.description = this.descriptionValue;
    if (this.urlValue) embed.url = this.urlValue;
    if (this.colorValue !== null) embed.color = this.colorValue;
    if (this.timestampValue) embed.timestamp = this.timestampValue;
    if (this.authorValue) {
      const author: NonNullable<APIEmbedInput["author"]> = { name: this.authorValue.name };
      if (this.authorValue.url) author.url = this.authorValue.url;
      if (this.authorValue.iconUrl) author.icon_url = this.authorValue.iconUrl;
      embed.author = author;
    }
    if (this.footerValue) {
      const footer: NonNullable<APIEmbedInput["footer"]> = { text: this.footerValue.text };
      if (this.footerValue.iconUrl) footer.icon_url = this.footerValue.iconUrl;
      embed.footer = footer;
    }
    if (this.imageValue) embed.image = { url: this.imageValue };
    if (this.thumbnailValue) embed.thumbnail = { url: this.thumbnailValue };
    if (this.fieldsValue.length > 0) embed.fields = [...this.fieldsValue];
    return embed;
  }

  /** Soma dos textos do embed (para conferir o limite de 6000 por mensagem). */
  get textLength(): number {
    let total = 0;
    if (this.titleValue) total += this.titleValue.length;
    if (this.descriptionValue) total += this.descriptionValue.length;
    if (this.footerValue) total += this.footerValue.text.length;
    if (this.authorValue) total += this.authorValue.name.length;
    for (const field of this.fieldsValue) {
      total += field.name.length + field.value.length;
    }
    return total;
  }

  /** Cria um builder a partir de um payload existente. */
  static from(embed: APIEmbed | APIEmbedInput): EmbedBuilder {
    const builder = new EmbedBuilder();
    if (embed.title) builder.setTitle(embed.title);
    if (embed.description) builder.setDescription(embed.description);
    if (embed.url) builder.setURL(embed.url);
    if (embed.color != null) builder.setColor(embed.color);
    if (embed.timestamp) builder.setTimestamp(embed.timestamp);
    if ("author" in embed && embed.author) {
      builder.setAuthor({
        name: embed.author.name,
        url: "url" in embed.author ? (embed.author.url ?? undefined) : undefined,
        iconUrl: "iconUrl" in embed.author ? (embed.author.iconUrl ?? undefined) : undefined,
      });
    }
    if ("footer" in embed && embed.footer) {
      builder.setFooter({
        text: embed.footer.text,
        iconUrl: "iconUrl" in embed.footer ? (embed.footer.iconUrl ?? undefined) : undefined,
      });
    }
    if ("fields" in embed && Array.isArray(embed.fields) && embed.fields.length > 0) {
      builder.addFields(...embed.fields);
    }
    const image = "image" in embed ? embed.image : null;
    if (image && "url" in image) builder.setImage(image.url);
    const thumbnail = "thumbnail" in embed ? (embed as APIEmbedInput).thumbnail : null;
    if (thumbnail && "url" in thumbnail) builder.setThumbnail(thumbnail.url);
    return builder;
  }
}

function assertLength(field: string, value: string, max: number): void {
  if (value.length > max) {
    throw new SquordTypeError(`Embed.${field} excede ${max} caracteres (${value.length})`);
  }
}

function assertHttpUrl(field: string, url: string): void {
  if (!/^https?:\/\//.test(url)) {
    throw new SquordTypeError(`Embed.${field} precisa ser http:// ou https:// (recebido: ${url})`);
  }
}
