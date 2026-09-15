import type { WidgetDefinition, WidgetFieldType, WidgetMetadata } from './interfaces';

/**
 * Registro singleton de widgets disponibles.
 * Permite registrar widgets nuevos en tiempo de ejecución.
 *
 * No importa widgets concretos: el registro es agnóstico. La lista de
 * widgets estándar se registra desde `register-widgets.ts`.
 */
export class WidgetRegistry {
  private widgets = new Map<string, WidgetDefinition>();

  register(definition: WidgetDefinition): void {
    const key = definition.metadata.name;
    if (this.widgets.has(key)) {
      console.warn(`Widget "${key}" already registered. Overwriting.`);
    }
    this.widgets.set(key, definition);
  }

  unregister(name: string): void {
    this.widgets.delete(name);
  }

  get(name: string): WidgetDefinition | undefined {
    return this.widgets.get(name);
  }

  getMetadata(name: string): WidgetMetadata | undefined {
    return this.widgets.get(name)?.metadata;
  }

  getAll(): WidgetDefinition[] {
    return Array.from(this.widgets.values()).sort(
      (a, b) => a.metadata.priority - b.metadata.priority
    );
  }

  getByCategory(category: WidgetMetadata['category']): WidgetDefinition[] {
    return this.getAll().filter((w) => w.metadata.category === category);
  }

  getByFieldType(fieldType: WidgetFieldType): WidgetDefinition[] {
    return this.getAll().filter((w) => w.metadata.acceptedFieldTypes.includes(fieldType));
  }

  /**
   * Devuelve el widget más adecuado para un tipo de campo dado.
   * Útil para auto-configurar el layout tras descubrir el schema.
   */
  getRecommendedFor(fieldType: WidgetFieldType): WidgetDefinition | undefined {
    return this.getByFieldType(fieldType)[0];
  }

  destroyAll(): void {
    this.widgets.clear();
  }
}

export const widgetRegistry = new WidgetRegistry();
