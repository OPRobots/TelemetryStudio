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
import {
  GRID_COLUMNS,
  clampGridHeight,
  clampGridWidth,
  packGridRows,
} from './grid';

export type VideoFit = 'contain' | 'cover';
export type PanelStyle = 'translucent' | 'none';
export type ResolutionPreset = '720p' | '1080p' | '1440p' | '2160p' | 'source';
export type AspectPreset = 'source' | '16:9' | '9:16' | '1:1' | '4:5' | 'custom';
/** `flow` = el vídeo es un ítem más; `background` = a sangre detrás de todo. */
export type VideoPlacement = 'flow' | 'background';
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
  videoPlacement: VideoPlacement;
  videoFit: VideoFit;
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
  videoPlacement: VideoPlacement;
  videoFit: VideoFit;
  /** Región del vídeo a sangre cuando `videoPlacement === 'background'`. */
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
 * Longitud del **lado corto** para cada preset (`source` = lado corto nativo).
 * Así `1080p` es 1920×1080 en 16:9, 1080×1920 en 9:16 y 1080×1080 en 1:1.
 */
const RESOLUTION_SHORT_EDGE: Record<ResolutionPreset, number | null> = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '2160p': 2160,
  source: null,
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
function aspectRatio(
  aspect: AspectPreset,
  customAspect?: Size,
  source?: Size | null
): number {
  if (aspect === 'source') {
    return source && source.height > 0 ? source.width / source.height : 16 / 9;
  }
  if (aspect === 'custom') {
    return customAspect && customAspect.height > 0
      ? customAspect.width / customAspect.height
      : 16 / 9;
  }
  return NAMED_ASPECT[aspect];
}

/**
 * Resolución final (pares) a partir del **lado corto** del preset y la relación
 * de aspecto. `source` usa el lado corto del vídeo (o 1080 si no hay vídeo).
 */
export function resolveOutputSize(
  resolution: ResolutionPreset,
  ratio: number,
  source?: Size | null
): Size {
  const short =
    RESOLUTION_SHORT_EDGE[resolution] ?? (source ? Math.min(source.width, source.height) : 1080);
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

export function computeBoardLayout(
  board: ExportBoard,
  source?: Size | null,
  outputSize?: Size
): ExportLayout {
  const ratio = aspectRatio(board.aspect, board.customAspect, source);
  const size = outputSize
    ? { width: toEven(outputSize.width), height: toEven(outputSize.height) }
    : resolveOutputSize(board.resolution, ratio, source);
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
    board.videoPlacement === 'background'
      ? board.items.find((i) => i.kind === 'video') ?? null
      : null;

  const flowItems = board.items.filter(
    (i) => !(i.kind === 'video' && board.videoPlacement === 'background')
  );

  const items: PlacedItem[] = [];

  if (flowItems.length > 0) {
    const colUnit = (inner.w - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const cellWidth = (cols: number): number => cols * colUnit + (cols - 1) * gap;
    const videoAspect =
      source && source.width > 0 && source.height > 0 ? source.width / source.height : null;

    const rows = packGridRows(flowItems.map((i) => ({ ...i, width: clampGridWidth(i.width) })));

    // Altura por fila: las que contienen el vídeo la derivan de su aspecto (la
    // celda del vídeo nunca se deforma); el resto son "flexibles" (pesos) y se
    // reparten el alto restante.
    const rowDefs = rows.map((row) => {
      const videoItem = row.find((i) => i.kind === 'video');
      const weight = Math.max(...row.map((i) => clampGridHeight(i.height)), 1);
      if (videoItem && videoAspect) {
        return {
          row,
          weight,
          fixedHeight: cellWidth(clampGridWidth(videoItem.width)) / videoAspect,
        };
      }
      return { row, weight, fixedHeight: null as number | null };
    });

    const totalGap = gap * Math.max(rows.length - 1, 0);
    const maxAvailable = Math.max(inner.h - totalGap, 1);
    let fixedTotal = rowDefs.reduce((sum, def) => sum + (def.fixedHeight ?? 0), 0);
    if (fixedTotal > maxAvailable && fixedTotal > 0) {
      const scaleDown = maxAvailable / fixedTotal;
      for (const def of rowDefs) {
        if (def.fixedHeight != null) def.fixedHeight *= scaleDown;
      }
      fixedTotal = maxAvailable;
    }
    const flexWeight = rowDefs.reduce(
      (sum, def) => sum + (def.fixedHeight == null ? def.weight : 0),
      0
    );
    const unit = flexWeight > 0 ? Math.max(maxAvailable - fixedTotal, 0) / flexWeight : 0;

    let y = inner.y;
    for (const def of rowDefs) {
      const rowHeight = def.fixedHeight ?? def.weight * unit;
      let usedCols = 0;
      for (const item of def.row) {
        const cols = clampGridWidth(item.width);
        const x = inner.x + usedCols * (colUnit + gap);
        const w = cellWidth(cols);
        const h = def.fixedHeight != null ? rowHeight : clampGridHeight(item.height) * unit;
        items.push({
          id: item.id,
          kind: item.kind,
          widgetId: item.widgetId,
          label: item.label,
          rect: {
            x: Math.round(x),
            y: Math.round(y),
            w: Math.round(w),
            h: Math.max(1, Math.round(h)),
          },
          panel: board.panel,
        });
        usedCols += cols;
      }
      y += Math.max(1, rowHeight) + gap;
    }
  }

  return {
    width,
    height,
    background: board.background,
    supersample: board.supersample,
    lineScale: board.lineScale ?? 1,
    videoPlacement: board.videoPlacement,
    videoFit: board.videoFit,
    backgroundVideoRect: backgroundItem ? { x: 0, y: 0, w: width, h: height } : null,
    labelRect: showLabel ? { x: 0, y: 0, w: width, h: labelHeight } : null,
    copyrightRect: { x: 0, y: height - copyrightHeight, w: width, h: copyrightHeight },
    items,
  };
}

export type BoardPreset = 'overlay' | 'vertical' | 'horizontal' | 'charts-only';

interface PresetOptions {
  widgetIds: string[];
  hasVideo?: boolean;
  resolution?: ResolutionPreset;
  aspect?: AspectPreset;
}

const VIDEO_RECT_DEFAULT: Pick<ExportItem, 'width' | 'height'> = { width: 12, height: 6 };

/**
 * Crea un board inicial a partir de un preset, editable después. Los widgets
 * reciben ancho/alto por defecto (se pueden redimensionar en el editor).
 */
export function createBoardPreset(preset: BoardPreset, options: PresetOptions): ExportBoard {
  const { widgetIds, hasVideo = false } = options;
  const resolution = options.resolution ?? '1080p';
  const seed = preset;
  let n = 0;
  const nextId = (): string => `${seed}-${n++}`;

  const video = (): ExportItem => ({
    id: nextId(),
    kind: 'video',
    ...VIDEO_RECT_DEFAULT,
  });
  const section = (width: number, height: number, label?: string): ExportItem => ({
    id: nextId(),
    kind: 'section',
    width,
    height,
    label,
  });
  const widget = (widgetId: string, width: number, height: number): ExportItem => ({
    id: nextId(),
    kind: 'widget',
    widgetId,
    width,
    height,
  });

  const base: ExportBoard = {
    aspect: options.aspect ?? 'source',
    resolution,
    videoPlacement: 'flow',
    videoFit: 'contain',
    panel: 'translucent',
    supersample: 1,
    lineScale: 1.5,
    showLabel: true,
    background: DEFAULT_BACKGROUND,
    items: [],
  };

  if (preset === 'overlay') {
    base.aspect = options.aspect ?? 'source';
    base.videoPlacement = 'background';
    if (hasVideo) base.items.push(video());
    base.items.push(section(12, 7));
    for (const id of widgetIds) base.items.push(widget(id, 6, 6));
  } else if (preset === 'vertical') {
    base.aspect = options.aspect ?? '9:16';
    if (hasVideo) base.items.push(video());
    for (const id of widgetIds) base.items.push(widget(id, 12, 5));
  } else if (preset === 'horizontal') {
    base.aspect = options.aspect ?? '16:9';
    // El vídeo ocupa 6 columnas; el primer widget comparte su fila y el resto
    // van debajo a dos columnas.
    if (hasVideo) base.items.push({ ...video(), width: 6 });
    for (const id of widgetIds) base.items.push(widget(id, 6, 6));
  } else {
    // charts-only
    base.aspect = options.aspect ?? '16:9';
    for (const id of widgetIds) base.items.push(widget(id, 6, 6));
  }

  return base;
}
