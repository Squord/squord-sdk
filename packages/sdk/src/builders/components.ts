/**
 * Builders de componentes: botões e menus de seleção.
 *
 * Regras do Squord: uma mensagem tem até 5 linhas; cada linha guarda até 5
 * botões **ou** exatamente 1 menu (nunca os dois); `customId` é único na
 * mensagem (até 100 caracteres); `link` tem `url` e não tem `customId`.
 */

import { SquordTypeError } from "../errors";
import type { APIButton, APIComponentRow, APISelectMenu, APISelectOption, ButtonStyle } from "../types/api";

export const ComponentLimits = {
  RowsPerMessage: 5,
  ButtonsPerRow: 5,
  CustomId: 100,
  Label: 80,
  OptionsPerMenu: 25,
} as const;

export class ButtonBuilder {
  private customIdValue: string | undefined;
  private urlValue: string | undefined;
  private disabledValue = false;

  constructor(
    private readonly style: ButtonStyle,
    private labelValue: string,
  ) {}

  /** Identificador da ação; obrigatório (e único na mensagem) fora do estilo `link`. */
  setCustomId(customId: string): this {
    assertCustomId(customId);
    this.customIdValue = customId;
    return this;
  }

  /** URL aberta ao clicar; obrigatória e exclusiva do estilo `link`. */
  setURL(url: string): this {
    if (!/^https:\/\//.test(url)) {
      throw new SquordTypeError(`Botão de link exige URL https:// (recebido: ${url})`);
    }
    this.urlValue = url;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabledValue = disabled;
    return this;
  }

  setLabel(label: string): this {
    this.labelValue = label;
    return this;
  }

  build(): APIButton {
    if (this.style === "link" && !this.urlValue) {
      throw new SquordTypeError("Botão de link exige setURL(...)");
    }
    if (this.style !== "link" && !this.customIdValue) {
      throw new SquordTypeError(`Botão de estilo ${this.style} exige setCustomId(...)`);
    }
    if (this.labelValue.length > ComponentLimits.Label) {
      throw new SquordTypeError(`Label de botão excede ${ComponentLimits.Label} caracteres`);
    }
    return {
      type: "button",
      style: this.style,
      label: this.labelValue,
      customId: this.style === "link" ? undefined : this.customIdValue,
      url: this.style === "link" ? this.urlValue : undefined,
      disabled: this.disabledValue || undefined,
    };
  }
}

export class SelectMenuBuilder {
  private placeholderValue: string | undefined;
  private minValuesValue: number | undefined;
  private maxValuesValue: number | undefined;
  private disabledValue = false;
  private optionsValue: APISelectOption[] = [];

  constructor(private readonly customId: string) {
    assertCustomId(customId);
  }

  setPlaceholder(placeholder: string): this {
    if (placeholder.length > 150) {
      throw new SquordTypeError("Placeholder de menu excede 150 caracteres");
    }
    this.placeholderValue = placeholder;
    return this;
  }

  setMinValues(min: number): this {
    this.minValuesValue = min;
    return this;
  }

  setMaxValues(max: number): this {
    this.maxValuesValue = max;
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.disabledValue = disabled;
    return this;
  }

  addOption(option: APISelectOption): this {
    if (this.optionsValue.length >= ComponentLimits.OptionsPerMenu) {
      throw new SquordTypeError(`Menu aceita no máximo ${ComponentLimits.OptionsPerMenu} opções`);
    }
    if (!option.label || !option.value) {
      throw new SquordTypeError("Opção de menu exige label e value");
    }
    if (option.label.length > ComponentLimits.Label || option.value.length > 100) {
      throw new SquordTypeError("Label de opção: até 80 caracteres; value: até 100");
    }
    this.optionsValue.push(option);
    return this;
  }

  addOptions(...options: APISelectOption[]): this {
    for (const option of options) this.addOption(option);
    return this;
  }

  build(): APISelectMenu {
    if (this.optionsValue.length === 0) {
      throw new SquordTypeError("Menu de seleção precisa de ao menos uma opção");
    }
    const min = this.minValuesValue ?? 1;
    const max = this.maxValuesValue ?? Math.max(1, this.optionsValue.length);
    if (min > max) {
      throw new SquordTypeError(`minValues (${min}) não pode passar de maxValues (${max})`);
    }
    return {
      type: "select",
      customId: this.customId,
      placeholder: this.placeholderValue,
      minValues: this.minValuesValue,
      maxValues: this.maxValuesValue,
      disabled: this.disabledValue || undefined,
      options: [...this.optionsValue],
    };
  }
}

export class ActionRowBuilder {
  private components: Array<APIButton | APISelectMenu> = [];

  /** Adiciona um botão (até 5 por linha). */
  addButton(button: ButtonBuilder | APIButton): this {
    if (this.components.length >= ComponentLimits.ButtonsPerRow || this.components.some((c) => c.type === "select")) {
      throw new SquordTypeError("Uma linha aceita até 5 botões e não mistura botões com menus");
    }
    this.components.push(button instanceof ButtonBuilder ? button.build() : button);
    return this;
  }

  /** Define o menu da linha (exatamente 1, sozinho). */
  setSelectMenu(menu: SelectMenuBuilder | APISelectMenu): this {
    if (this.components.length > 0) {
      throw new SquordTypeError("Um menu ocupa a linha sozinho; não misture com botões");
    }
    this.components.push(menu instanceof SelectMenuBuilder ? menu.build() : menu);
    return this;
  }

  addComponents(...components: Array<ButtonBuilder | SelectMenuBuilder | APIButton | APISelectMenu>): this {
    for (const component of components) {
      if (component instanceof ButtonBuilder || ("type" in component && component.type === "button")) {
        this.addButton(component as ButtonBuilder | APIButton);
      } else {
        this.setSelectMenu(component as SelectMenuBuilder | APISelectMenu);
      }
    }
    return this;
  }

  build(): APIComponentRow {
    if (this.components.length === 0) {
      throw new SquordTypeError("Linha de componentes vazia");
    }
    return { type: "row", components: [...this.components] };
  }
}

/** Atalhos para botões dos quatro estilos. */
export const Buttons = {
  primary: (label: string) => new ButtonBuilder("primary", label),
  secondary: (label: string) => new ButtonBuilder("secondary", label),
  danger: (label: string) => new ButtonBuilder("danger", label),
  link: (label: string) => new ButtonBuilder("link", label),
};

function assertCustomId(customId: string): void {
  if (typeof customId !== "string" || customId.length < 1 || customId.length > ComponentLimits.CustomId) {
    throw new SquordTypeError(
      `customId precisa ter de 1 a ${ComponentLimits.CustomId} caracteres`,
    );
  }
}
