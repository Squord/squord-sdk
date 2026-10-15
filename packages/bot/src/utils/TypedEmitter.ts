/**
 * Event emitter tipado, sem dependências externas.
 *
 * Suporta `on`, `once`, `off` e `emit`, com mapa de eventos estritamente
 * tipado. Handlers síncronos e assíncronos são aceitos; erros de handlers
 * assíncronos são capturados e entregues ao evento `error` da mesma instância
 * (ou `uncaught`), sem derrubar o processo.
 */

export type EventHandler<K> = [K] extends [unknown[]] ? (...args: K) => unknown : (payload: K) => unknown;

/** Converte o tipo de payload em tupla de argumentos (sem distribuir unions). */
type ArgsOf<K> = [K] extends [unknown[]] ? K : [K];

export interface EventMap {
  [event: string]: unknown;
}

export class TypedEmitter<Events extends EventMap> {
  private handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  /** Registra um handler. Devolve uma função que o remove. */
  on<E extends keyof Events>(event: E, handler: EventHandler<Events[E]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as EventHandler<never>);
    return () => this.off(event, handler);
  }

  /** Registra um handler que é removido após a primeira chamada. */
  once<E extends keyof Events>(event: E, handler: EventHandler<Events[E]>): () => void {
    const wrapper = ((...args: ArgsOf<Events[E]>) => {
      this.off(event, wrapper as EventHandler<Events[E]>);
      void (handler as (...a: unknown[]) => unknown)(...args);
    }) as unknown as EventHandler<Events[E]>;
    return this.on(event, wrapper);
  }

  /** Remove um handler (ou todos do evento, se omitido). */
  off<E extends keyof Events>(event: E, handler?: EventHandler<Events[E]>): void {
    if (!handler) {
      this.handlers.delete(event);
      return;
    }
    this.handlers.get(event)?.delete(handler as EventHandler<never>);
  }

  /** Remove todos os handlers de todos os eventos. */
  removeAllListeners(): void {
    this.handlers.clear();
  }

  /** Emite um evento. Erros síncronos de handlers propagam para `error`. */
  emit<E extends keyof Events>(event: E, ...args: ArgsOf<Events[E]>): boolean {
    const set = this.handlers.get(event);
    if (!set || set.size === 0) return false;
    for (const handler of [...set]) {
      try {
        const result = (handler as (...a: unknown[]) => unknown)(...args);
        if (result instanceof Promise) {
          void result.catch((err: unknown) => this.handleAsyncError(event, err));
        }
      } catch (err) {
        this.handleAsyncError(event, err);
      }
    }
    return true;
  }

  /** Quantos handlers estão registrados para um evento. */
  listenerCount<E extends keyof Events>(event: E): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  /** Nomes de eventos com pelo menos um handler. */
  eventNames(): Array<keyof Events> {
    return [...this.handlers.keys()].filter((k) => (this.handlers.get(k)?.size ?? 0) > 0);
  }

  private handleAsyncError(event: keyof Events, err: unknown): void {
    if (event === "error") throw err;
    const error = err instanceof Error ? err : new Error(String(err));
    (this.emit as unknown as (event: "error", payload: Error) => void)("error", error);
  }
}
