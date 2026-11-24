/**
 * Construye condiciones WHERE con parámetros numerados ($1, $2...). Los fragmentos son texto fijo escrito en
 * el código; los valores del cliente siempre viajan como parámetros, nunca dentro del SQL.
 */
export class SqlConditions {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];

  /** Agrega un fragmento; cada `?` se reemplaza por el siguiente parámetro. */
  add(fragment: string, ...values: unknown[]): this {
    let i = 0;
    const text = fragment.replace(/\?/g, () => {
      if (i >= values.length) throw new Error('Faltan valores para el fragmento SQL');
      this.params.push(values[i++]);
      return `$${this.params.length}`;
    });
    if (i !== values.length) throw new Error('Sobran valores para el fragmento SQL');
    this.parts.push(`(${text})`);
    return this;
  }

  /** Agrega el fragmento solo si se cumple la condición. */
  addIf(condition: boolean, fragment: string, ...values: unknown[]): this {
    return condition ? this.add(fragment, ...values) : this;
  }

  where(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }

  /** Parámetro adicional (LIMIT, OFFSET) y su marcador. */
  param(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}
