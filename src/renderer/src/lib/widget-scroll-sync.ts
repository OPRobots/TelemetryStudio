/**
 * Sincroniza el scroll de varios contenedores (rejillas de widgets) que
 * pertenecen al mismo grupo (p. ej. los dos paneles de la comparación).
 *
 * Propaga `scrollTop` y `scrollLeft` al resto del grupo. La guarda por
 * comparación evita el bucle: al aplicar el scroll al otro elemento, su propio
 * evento verá los valores ya iguales y no reenviará.
 */
const byGroup = new Map<string, Set<HTMLElement>>();
const groupOf = new WeakMap<HTMLElement, string>();

/** Registra un elemento en un grupo. Devuelve la función para desregistrarlo. */
export function registerScrollElement(group: string, el: HTMLElement): () => void {
  let set = byGroup.get(group);
  if (!set) {
    set = new Set();
    byGroup.set(group, set);
  }
  set.add(el);
  groupOf.set(el, group);

  return () => {
    set?.delete(el);
    groupOf.delete(el);
    if (set && set.size === 0) byGroup.delete(group);
  };
}

/** Iguala el scroll del resto de elementos del grupo al de `el`. */
export function propagateScroll(el: HTMLElement): void {
  const group = groupOf.get(el);
  if (!group) return;
  const set = byGroup.get(group);
  if (!set) return;

  for (const other of set) {
    if (other === el) continue;
    if (other.scrollTop === el.scrollTop && other.scrollLeft === el.scrollLeft) continue;
    other.scrollTop = el.scrollTop;
    other.scrollLeft = el.scrollLeft;
  }
}
