/**
 * Modelo del **editor de exportación** (board).
 *
 * Un `ExportBoard` es una lista ordenada de ítems (widgets de la sesión, el
 * vídeo, y secciones/espacios transparentes) que se empaquetan en una rejilla de
 * 12 columnas, igual que el dashboard principal. `computeBoardLayout` (puro)
 * traduce el board a rectángulos en píxeles para el compositor.
 *
 * Módulo **puro** (sin dependencias de renderer/DOM) para poder testearse.
 */
import { GRID_COLUMNS, clampGridHeight, clampGridWidth } from './grid';

export type VideoFit = 'contain' | 'cover';
export type PanelStyle = 'translucent' | 'none';
export type ResolutionPreset = '720p' | '1080p' | '1440p' | '2160p';
export type AspectPreset = '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
/** `hidden` = sin vídeo; `flow` = ítem del layout; `background` = a sangre detrás. */
export type VideoMode = 'hidden' | 'flow' | 'background';
/** `section` es un hueco/sección **transparente** (no dibuja nada). */
export type ExportItemKind = 'widget' | 'video' | 'section';

/** Rectángulo en píxeles. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Vista estructural mínima de un widget que necesita el compositor. */
export interface CompositionWidget {
  id: string;
  type: string;
  label: string;
  dataFields: string[];
  config: Record<string, unknown>;
}

/** Ítem del board (ancho en columnas 3..12 y alto en filas 2..16). */
export interface ExportItem {
  id: string;
  kind: ExportItemKind;
  /** Solo para `kind === 'widget'`. */
  widgetId?: string;
  /** Solo para `kind === 'section'`: etiqueta del editor (no se exporta). */
  label?: string;
  width: number;
  height: number;
}

export interface ExportBoard {
  aspect: AspectPreset;
  customAspect?: Size;
  resolution: ResolutionPreset;
  videoMode: VideoMode;
  panel: PanelStyle;
  supersample: number;
  /** Factor de grosor de líneas/trazos solo para la exportación (1 = normal). */
  lineScale: number;
  /** Reserva una franja superior con la etiqueta de sesión. */
  showLabel?: boolean;
  background: string;
  items: ExportItem[];
}

/** Ítem ya posicionado en píxeles. */
export interface PlacedItem {
  id: string;
  kind: ExportItemKind;
  widgetId?: string;
  label?: string;
  rect: Rect;
  panel: PanelStyle;
}

export interface ExportLayout {
  width: number;
  height: number;
  background: string;
  supersample: number;
  /** Grosor de línea relativo para los widgets en la exportación. */
  lineScale: number;
  /** Región del vídeo a sangre cuando el modo es `background`. */
  backgroundVideoRect: Rect | null;
  /** Franja superior de la etiqueta de sesión (si `showLabel`). */
  labelRect: Rect | null;
  /** Franja inferior del copyright (siempre presente). */
  copyrightRect: Rect;
  /** Ítems en orden de pintado (los posteriores van encima). */
  items: PlacedItem[];
}

/** Alto de la franja de la etiqueta de sesión (px) para un alto de salida. */
export function labelBarHeight(outputHeight: number): number {
  return Math.max(20, Math.round(30 * (outputHeight / 1080)));
}

/** Alto de la franja del copyright (px) para un alto de salida. */
export function copyrightBarHeight(outputHeight: number): number {
  return Math.max(18, Math.round(30 * (outputHeight / 1080)));
}

const DEFAULT_BACKGROUND = '#0a0e17';

/**
 * Longitud del **lado corto** para cada preset.
 * Así `1080p` es 1920×1080 en 16:9, 1080×1920 en 9:16 y 1080×1080 en 1:1.
 */
const RESOLUTION_SHORT_EDGE: Record<ResolutionPreset, number> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
};

const NAMED_ASPECT: Record<'16:9' | '9:16' | '1:1' | '4:5', number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:5': 4 / 5,
};

/** Redondea a un entero par ≥ 2 (H.264 `yuv420p` exige dimensiones pares). */
export function toEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

/** Relación de aspecto (ancho / alto) para un preset. */
function aspectRatio(aspect: AspectPreset, customAspect?: Size): number {
  if (aspect === 'custom') {
    return customAspect && customAspect.height > 0
      ? customAspect.width / customAspect.height
      : 16 / 9;
  }
  return NAMED_ASPECT[aspect];
}

/**
 * Resolución final (pares) a partir del **lado corto** del preset y la relación
 * de aspecto.
 */
export function resolveOutputSize(resolution: ResolutionPreset, ratio: number): Size {
  const short = RESOLUTION_SHORT_EDGE[resolution];
  const safeRatio = ratio > 0 ? ratio : 16 / 9;
  const width = safeRatio >= 1 ? short * safeRatio : short;
  const height = safeRatio >= 1 ? short : short / safeRatio;
  return { width: toEven(width), height: toEven(height) };
}

/**
 * Rectángulo que encaja `src` dentro de `dst` conservando el aspecto.
 * `contain` = cabe entero (letterbox); `cover` = llena recortando.
 */
export function fitRect(src: Size, dst: Rect, fit: VideoFit): Rect {
  if (src.width <= 0 || src.height <= 0) return { ...dst };
  const scale =
    fit === 'cover'
      ? Math.max(dst.w / src.width, dst.h / src.height)
      : Math.min(dst.w / src.width, dst.h / src.height);
  const w = src.width * scale;
  const h = src.height * scale;
  return { x: dst.x + (dst.w - w) / 2, y: dst.y + (dst.h - h) / 2, w, h };
}

/**
 * Traduce el board a un `ExportLayout` con rectángulos en píxeles.
 *
 * - Los ítems se empaquetan en filas de 12 columnas (flujo).
 * - La **unidad de fila** se ajusta para que el contenido llene el alto útil: los
 *   altos son **relativos** (pesos), así el board siempre encaja.
 * - El vídeo `background` se saca del flujo y se dibuja a sangre.
 * - `outputSize` permite forzar un tamaño (p. ej. la previsualización).
 */
/** Márgenes internos (padding y gap) del board para un tamaño de salida. */
export function boardPadding(width: number, height: number): { pad: number; gap: number } {
  const scale = height / 1080;
  return {
    pad: Math.max(4, Math.round(24 * scale)),
    gap: Math.max(2, Math.round(12 * scale)),
  };
}

export interface SkylineEntry {
  item: ExportItem;
  /** Columnas ocupadas (3..12). */
  cols: number;
  /** Alto en unidades. */
  heightUnits: number;
}

export interface SkylinePlacement {
  item: ExportItem;
  cols: number;
  /** Columna inicial (0..12-cols). */
  x: number;
  /** Fila (en unidades) donde se coloca. */
  y: number;
  heightUnits: number;
}

/**
 * Empaquetador **skyline (bottom-left)**: coloca cada ítem en la posición más
 * alta posible sin solape, rellenando huecos (rejilla *staggered*).
 */
export function skylinePack(entries: SkylineEntry[]): {
  placements: SkylinePlacement[];
  totalUnits: number;
} {
  const skyline = new Array<number>(GRID_COLUMNS).fill(0);
  const placements: SkylinePlacement[] = [];

  for (const entry of entries) {
    const { item, cols, heightUnits } = entry;
    let bestX = 0;
    let bestTop = Infinity;
    for (let x = 0; x + cols <= GRID_COLUMNS; x++) {
      let top = 0;
      for (let c = x; c < x + cols; c++) top = Math.max(top, skyline[c]!);
      if (top < bestTop - 1e-9) {
        bestTop = top;
        bestX = x;
      }
    }
    const top = Number.isFinite(bestTop) ? bestTop : 0;
    for (let c = bestX; c < bestX + cols; c++) skyline[c] = top + heightUnits;
    placements.push({ item, cols, x: bestX, y: top, heightUnits });
  }

  const totalUnits = skyline.reduce((max, value) => Math.max(max, value), 0);
  return { placements, totalUnits };
}

export function computeBoardLayout(
  board: ExportBoard,
  source?: Size | null,
  outputSize?: Size
): ExportLayout {
  const ratio = aspectRatio(board.aspect, board.customAspect);
  const size = outputSize
    ? { width: toEven(outputSize.width), height: toEven(outputSize.height) }
    : resolveOutputSize(board.resolution, ratio);
  const { width, height } = size;

  const { pad, gap } = boardPadding(width, height);
  const scale = height / 1080;
  const showLabel = board.showLabel ?? false;
  const labelHeight = showLabel ? labelBarHeight(height) : 0;
  const copyrightHeight = copyrightBarHeight(height);
  // El board se dispone entre la franja de la etiqueta (arriba) y la del
  // copyright (abajo): así ninguna tapa widgets. El hueco bajo la etiqueta es
  // pequeño (margen inferior reducido).
  const topInset = showLabel ? labelHeight + Math.max(6, Math.round(10 * scale)) : pad;
  const inner: Rect = {
    x: pad,
    y: topInset,
    w: width - pad * 2,
    h: Math.max(1, height - topInset - copyrightHeight - pad),
  };

  const backgroundItem =
    board.videoMode === 'background'
      ? board.items.find((i) => i.kind === 'video') ?? null
      : null;

  // El vídeo solo entra en el flujo en modo `flow`; `background` se dibuja a
  // sangre y `hidden` no se dibuja.
  const flowItems = board.items.filter(
    (i) => !(i.kind === 'video' && board.videoMode !== 'flow')
  );

  // El panel solo aplica con el vídeo de fondo; en el resto, translúcido.
  const panel: PanelStyle = board.videoMode === 'background' ? board.panel : 'translucent';

  const colUnit = (inner.w - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const cellWidth = (cols: number): number => cols * colUnit + (cols - 1) * gap;
  const videoAspect =
    source && source.width > 0 && source.height > 0 ? source.width / source.height : null;

  // Alto del vídeo en px (por su aspecto); en "unidades" depende de la unidad.
  const videoPxHeight = (item: ExportItem): number | null =>
    item.kind === 'video' && videoAspect ? cellWidth(clampGridWidth(item.width)) / videoAspect : null;

  const buildEntries = (unitPx: number): SkylineEntry[] =>
    flowItems.map((item) => {
      const cols = clampGridWidth(item.width);
      const px = videoPxHeight(item);
      return {
        item,
        cols,
        heightUnits: px != null ? Math.max(px / unitPx, 0.05) : clampGridHeight(item.height),
      };
    });

  const items: PlacedItem[] = [];

  if (flowItems.length > 0) {
    // El vídeo tiene ancho libre y su alto (px) depende de la unidad → iteramos
    // para que la columna más alta llene el alto útil.
    const widgetUnits = flowItems
      .filter((i) => i.kind !== 'video')
      .reduce((sum, i) => sum + clampGridHeight(i.height), 0);
    let unit = widgetUnits > 0 ? inner.h / widgetUnits : inner.h;
    for (let k = 0; k < 8; k++) {
      const packed = skylinePack(buildEntries(unit));
      const next = packed.totalUnits > 0 ? inner.h / packed.totalUnits : unit;
      if (!Number.isFinite(next) || next <= 0) break;
      const settled = Math.abs(next - unit) < 0.5;
      unit = next;
      if (settled) break;
    }
    const packed = skylinePack(buildEntries(unit));

    for (const placement of packed.placements) {
      const { item, cols, x, y } = placement;
      const px = videoPxHeight(item);
      items.push({
        id: item.id,
        kind: item.kind,
        widgetId: item.widgetId,
        label: item.label,
        rect: {
          x: Math.round(inner.x + x * (colUnit + gap)),
          y: Math.round(inner.y + y * unit),
          w: Math.round(cellWidth(cols)),
          h: Math.max(1, Math.round(px ?? clampGridHeight(item.height) * unit)),
        },
        panel,
      });
    }
  }

  return {
    width,
    height,
    background: board.background,
    supersample: board.supersample,
    lineScale: board.lineScale ?? 1,
    backgroundVideoRect: backgroundItem ? { x: 0, y: 0, w: width, h: height } : null,
    labelRect: showLabel ? { x: 0, y: 0, w: width, h: labelHeight } : null,
    copyrightRect: { x: 0, y: height - copyrightHeight, w: width, h: copyrightHeight },
    items,
  };
}

interface BoardWidget {
  id: string;
  height: number;
}

/** Ancho por defecto según el aspecto: media anchura en 16:9, completa en el resto. */
export function defaultItemWidth(aspect: AspectPreset): number {
  return aspect === '16:9' ? 6 : 12;
}

/**
 * Board inicial (única plantilla, sin presets):
 * - **16:9** → items a **media anchura** (`w6`) para repartir el alto.
 * - otros → items a **ancho completo** (`w12`).
 * - Alturas del layout principal; el vídeo conserva su aspecto.
 */
export function createDefaultBoard(
  aspect: AspectPreset,
  widgets: BoardWidget[],
  hasVideo: boolean
): ExportBoard {
  const width = defaultItemWidth(aspect);
  let n = 0;
  const nextId = (): string => `item-${n++}`;
  const items: ExportItem[] = [];
  if (hasVideo) items.push({ id: nextId(), kind: 'video', width, height: 6 });
  for (const widget of widgets) {
    items.push({
      id: nextId(),
      kind: 'widget',
      widgetId: widget.id,
      width,
      height: widget.height,
    });
  }

  return {
    aspect,
    resolution: '1080p',
    videoMode: hasVideo ? 'flow' : 'hidden',
    panel: 'translucent',
    supersample: 1,
    lineScale: 1.5,
    showLabel: true,
    background: DEFAULT_BACKGROUND,
    items,
  };
}

/**
 * Valida una resolución guardada. Migra la antigua `source` (y valores
 * desconocidos) a `1080p`.
 */
function toResolutionPreset(value: string | undefined): ResolutionPreset {
  return value === '720p' || value === '1080p' || value === '1440p' || value === '2160p'
    ? value
    : '1080p';
}

/**
 * Normaliza un board guardado (p. ej. de una versión anterior con
 * `videoPlacement`/`videoFit`) y aplica valores por defecto.
 */
export function normalizeBoard(
  raw:
    | (Partial<Omit<ExportBoard, 'resolution'>> & {
        videoPlacement?: string;
        resolution?: string;
      })
    | null
    | undefined,
  hasVideo = true
): ExportBoard {
  const legacy =
    raw?.videoPlacement === 'background'
      ? 'background'
      : raw?.videoPlacement === 'flow'
        ? 'flow'
        : 'flow';
  const videoMode: VideoMode = hasVideo ? raw?.videoMode ?? legacy : 'hidden';
  const aspect: AspectPreset =
    raw?.aspect === '16:9' ||
    raw?.aspect === '9:16' ||
    raw?.aspect === '1:1' ||
    raw?.aspect === '4:5' ||
    raw?.aspect === 'custom'
      ? raw.aspect
      : '16:9';
  return {
    aspect,
    customAspect: raw?.customAspect,
    resolution: toResolutionPreset(raw?.resolution),
    videoMode,
    panel: raw?.panel ?? 'translucent',
    supersample: raw?.supersample ?? 1,
    lineScale: raw?.lineScale ?? 1.5,
    showLabel: raw?.showLabel ?? true,
    background: raw?.background ?? DEFAULT_BACKGROUND,
    items: raw?.items ?? [],
  };
}
