/**
 * Cache em memória opcional: TTL por item, limite de itens e invalidação.
 *
 * O padrão do SDK é armazenar apenas o necessário, com acesso sob demanda
 * aos demais dados. O cache **nunca** substitui a API: um item pode estar
 * defasado, e o backend continua sendo a autoridade.
 */

export interface CacheOptions {
  /** Tempo de vida por item, em milissegundos. Padrão: 300000 (5 min). */
  ttlMs?: number;
  /** Máximo de itens guardados; os mais antigos são descartados. Padrão: 1000. */
  maxSize?: number;
  /** Função de agora, injetável para testes. */
  now?: () => number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
  insertedAt: number;
}

export class Cache<K, V> {
  private readonly store = new Map<K, Entry<V>>();
  private readonly ttlMs: number;
  private readonly maxSize: number;
  private readonly now: () => number;

  constructor(options: CacheOptions = {}) {
    this.ttlMs = options.ttlMs ?? 300_000;
    this.maxSize = options.maxSize ?? 1_000;
    this.now = options.now ?? (() => Date.now());
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (this.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Map preserva ordem de inserção: re-inserir promove o item a "mais recente".
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.maxSize <= 0) return;
    const ttl = ttlMs ?? this.ttlMs;
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: ttl === Infinity ? Number.MAX_SAFE_INTEGER : this.now() + ttl, insertedAt: this.now() });
    this.evictIfNeeded();
  }

  has(key: K): boolean {
    return this.get(key) !== undefined || this.peek(key) !== undefined;
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    this.sweep();
    return this.store.size;
  }

  /** Itera itens vivos. */
  *entries(): IterableIterator<[K, V]> {
    for (const [key, entry] of [...this.store.entries()]) {
      if (this.now() < entry.expiresAt) yield [key, entry.value];
      else this.store.delete(key);
    }
  }

  private peek(key: K): V | undefined {
    return this.store.get(key)?.value;
  }

  private evictIfNeeded(): void {
    if (this.store.size <= this.maxSize) return;
    // Descarta os itens mais antigos (primeiros inseridos ainda vivos).
    const excess = this.store.size - this.maxSize;
    const iterator = this.store.keys();
    for (let i = 0; i < excess; i++) {
      const oldest = iterator.next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }

  private sweep(): void {
    const now = this.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.expiresAt) this.store.delete(key);
    }
  }
}
