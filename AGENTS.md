# AGENTS.md — Guía para Agentes de IA

## Identidad del Proyecto

**Telemetry Studio** — Aplicación de escritorio multiplataforma para análisis de telemetría de robots de competición con vídeo sincronizado.

- **Stack**: Electron 34, React 19, TypeScript 5.6, uPlot 1.6, Zustand 5, Tailwind CSS 4, serialport 13
- **Export**: FFmpeg como sidecar (raw RGBA por stdin)
- **Build**: electron-vite 2.x, electron-builder 25.x
- **Tests**: Vitest
- **Plataformas**: Windows, macOS, Linux (100% offline, portable)

## Arquitectura

```
Main Process (Node.js) ←→ Renderer Process (Chromium)
```

- **Main**: lifecycle, serialport, sesiones, exportación de vídeo (FFmpeg sidecar)
- **Renderer**: UI (React), sincronización vídeo, EventBus, widgets (Canvas 2D + uPlot)

Regla estricta: **nunca** importar desde `renderer/` hacia `main/`. Comunicación exclusivamente via IPC.

## Reglas de Trabajo

### Bugs: No commitear hasta confirmar resolución
**NUNCA** commitear cambios de resolución de bugs hasta que el usuario confirme que el bug está resuelto. Primero hacer el cambio, luego pedir al usuario que pruebe, y solo commitear después de confirmación.

## Convenciones de Commits

### Formato

```
tipo(categoría): Descripción en tercera persona

- Detalle del cambio 1
- Detalle del cambio 2
- Detalle del cambio 3
```

### Ejemplo

```
feat(widgets): Añade widget TimeSeriesChart con integración uPlot

- Implementa gráfica temporal con soporte para múltiples series
- Integra LTTB downsampling para datasets grandes
- Añade zoom/pan con cursor uPlot
- Incluye tests unitarios para downsampling
```

### Tipos

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `docs` | Documentación |
| `refactor` | Reestructuración sin cambio de comportamiento |
| `test` | Tests (sin cambio de funcionalidad) |
| `chore` | Tareas de mantenimiento, configs |
| `style` | Formato, espacios, semicolons (sin lógica) |

### Restricciones de Autoría

- **Sin co-author de IA** en commits
- Autoría exclusiva de robotaleh
- Los agentes hacen el trabajo, el usuario hace el commit

## Estilo de Código

### TypeScript
- `strict: true` siempre
- Nombrar tipos explícitamente (no `any` salvo justificación documentada)
- Interfaces para objetos, type unions para variantes

### React
- Functional components solamente (sin class components)
- Hooks personalizados en `src/renderer/src/hooks/`
- Estado global con Zustand stores (`src/renderer/src/stores/`)

### Nomenclatura

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos | `kebab-case.ts` | `event-bus.ts` |
| Componentes React | `PascalCase.tsx` | `VideoPlayer.tsx` |
| Interfaces/Tipos | `PascalCase` | `TelemetryFrame` |
| Funciones/variables | `camelCase` | `findClosestFrame` |
| Constantes | `UPPER_SNAKE_CASE` | `MAX_BAUD_RATE` |
| CSS classes | `kebab-case` | `widget-host` |

### Canvas y Widgets
- Renderizado con Canvas 2D (no WebGL salvo necesidad)
- uPlot para gráficas temporales
- Cada widget es un componente React que exporta una `WidgetDefinition`
  (`{ metadata, component }`) y se registra en `src/widgets/register-widgets.ts`

## Paleta de Colores — Dark Theme

> UI con base neutra y **acento azul OPR usado con moderación** (solo acciones
> primarias, foco y estados activos). El resto de controles son *ghost*
> (transparentes con hover neutro). Los tokens viven en `globals.css`.

### Superficies
```
#0b0e14  ← Fondo de la app (--bg-app)
#11151d  ← Paneles, barra de estado (--bg-panel)
#161b26  ← Elementos elevados, diálogos (--bg-elevated)
#1c2331  ← Hover (--bg-hover)
#232a38  ← Bordes y separadores (--bg-border)
#2f3949  ← Bordes fuertes (--border-strong)
```

### Acento (Azul OPR — moderado)
```
#2563eb  ← Acción primaria (--accent-strong)
#3b82f6  ← Hover / foco / activo (--accent)
rgba(59,130,246,0.14)  ← Fondos suaves de acento (--accent-soft)
```

### Semánticos
```
#34d399  ← OK / conectado (--ok)
#F2BE22  ← Avisos, warnings (--warn)
#f87171  ← Errores (--error)
```

### Texto
```
#e6eaf2  ← Texto primario
#a2adc0  ← Texto secundario
#6b7688  ← Texto terciario, placeholders
#454e5e  ← Texto deshabilitado
```

### Reglas de Color
- Base neutra; el azul se reserva a **acción primaria, foco y estado activo**
- Jerarquía por superficies (app → panel → elevado) y bordes sutiles, no por color
- Amarillo = advertencia, rojo = error; verde = correcto/conectado
- Transiciones suaves (120-200ms) para hover/focus; sin gradientes, glow ni partículas
- Excepción: LED glow en DigitalBitmask (funcional, no decorativo)
- Tipografía: base 13px; labels 11px mayúsculas con tracking; números `tabular-nums`/mono

## Testing

### Framework
- **Vitest** para unit tests e integration tests
- **Tests e2e**: harness Electron propio en `scripts/` (`npm run e2e`), sin Playwright

### Cobertura Objetivo
- Core (EventBus, TelemetryStore, binary search, LTTB, ComparisonManager): **80%**
- Parsers (SerialUART, JSONSession): **70%**
- Widgets: tests de renderizado básico

### Antes de Cada Commit
```bash
npm run verify  # lint + typecheck + tests + build + smoke + e2e (gate completo)
npm run lint    # Sin errores de ESLint
```

### Qué Testear
- Core: búsqueda binaria edge cases, LTTB preserva first/last, EventBus emisión/suscripción
- Parsers: round-trip encode/decode, parsing con fixtures
- ComparisonManager: validación de widgets idénticos/diferentes
- Video Sync: drift < 33ms, step forward/backward

## Estructura de Archivos

Referencia completa: `docs/03-FOLDER-STRUCTURE.md`

### Reglas de Dependencias
```
shared/    ← Sin dependencias internas
core/      ← Depende de shared/
parsers/   ← Depende de core/
widgets/   ← Depende de core/
services/  ← Depende de core/ y parsers/
renderer/  ← Depende de core/, widgets/, services/, shared/
main/      ← Depende de shared/ (NO de renderer/)
preload/   ← Sin dependencias (solo electron API)
```

## Restricciones Técnicas

- **OFFLINE absoluto**: Cero conexiones de red empaquetadas
- **Portable**: Sin instalación admin requerida
- **Video siempre pregrabado**: .mp4, nunca cámara en vivo
- **Comparación**: Máximo 2 sesiones simultáneas
- **Widgets idénticos**: En comparación, si difieren → error explicativo
- **serialport**: En `dependencies` (NO devDependency)
- **Modo sin vídeo**: se puede analizar telemetría (serial o sesión) sin vídeo cargado

## Flujo de Trabajo

### Flujo A — Serial + Vídeo
1. Cargar .mp4 → 2. Conectar serial → 3. Esperar fin del stream → 4. Configurar widgets → 5. Calibrar sync → 6. Analizar

### Flujo B — Sesión Guardada
1. Cargar session.json → 2. Restaurar todo automáticamente

### Flujo C — Comparación
1. Cargar sesión A → 2. Cargar sesión B → 3. Validar widgets idénticos → 4. Vista en paralelo (A izquierda / B derecha) con divisor vertical

## Documentación

Toda la documentación vive en `docs/`:

| Archivo | Contenido |
|---|---|
| `README.md` | Índice, glosario y recorrido por capas |
| `00-PROJECT-OVERVIEW.md` | Visión general, flujos de trabajo |
| `01-ARCHITECTURE.md` | Diagramas, flujos de datos |
| `02-TECH-STACK.md` | Decisiones tecnológicas |
| `03-FOLDER-STRUCTURE.md` | Estructura de carpetas |
| `04-DATA-MODEL.md` | Tipos TypeScript, EventMap |
| `05-PLUGIN-SYSTEM.md` | Parsers y widgets |
| `06-VIDEO-SYNC.md` | Sincronización vídeo-telemetría |
| `07-DATA-ENGINE.md` | EventBus, TelemetryStore, ComparisonManager |
| `08-WIDGET-SYSTEM.md` | Implementación de widgets |
| `09-VIDEO-EXPORT.md` | Exportación para redes sociales |
| `10-LAYOUT-MANAGER.md` | Persistencia de layouts |
| `11-PACKAGING.md` | Empaquetado multiplataforma |
| `12-LIMITATIONS.md` | Known issues y workarounds |
| `13-POC-TESTS.md` | Pruebas de concepto obligatorias |
| `14-SESSION-FORMAT.md` | Formato de sesión JSON compacto |
| `ROADMAP.md` | Fases y timeline |

**Regla**: Si se modifica el código, actualizar la documentación correspondiente. Los docs deben reflejar siempre el estado actual del proyecto.

### Comandos de Desarrollo

```bash
npm run dev          # Electron-vite dev (HMR en renderer, hot reload en main)
npm run build        # Build de producción
npm run typecheck    # Verificar tipos TypeScript
npm run test         # Ejecutar tests (Vitest)
npm run test:watch   # Tests en watch mode
npm run smoke        # Smoke test del renderer en Electron (requiere build)
npm run e2e          # 12 pruebas e2e (serial, vídeo, comparación, export, widgets, layouts...) (requiere build)
npm run verify       # Gate completo: lint + typecheck + tests + build + smoke + e2e
npm run lint         # ESLint
npm run poc:1        # PoC 1: Serial → Widget
npm run poc:2        # PoC 2: Video Sync
npm run poc:3        # PoC 3: Video Export
npm run poc:4        # PoC 4: Packaging test (dev)
```

### Comandos de Build (PoC 4)

```bash
cd pocs/04-packaging
npm install
npm run build:linux  # Build Linux (AppImage + DEB)
npm run build:mac    # Build macOS (DMG)
npm run build:win    # Build Windows (NSIS + portable)
```

### Estado del Proyecto

| Fase | Estado | Commits |
|---|---|---|
| Fase 0: Setup | ✅ Completada | `afff029` |
| Fase 1: Core Data Engine | ✅ Completada | `4207d3a` |
| Fase 2: Serial UART + JSON Parser | ✅ Completada | `da40292` |
| Fase 3: Video Sync | ✅ Completada | `c465cee` |
| Fase 4: Session Manager | ✅ Completada | `2545297` |
| Fase 5: Widgets + Comparación | ✅ Completada | `b5aa501` |
| Fase 6: Layout Manager | ✅ Completada | `c465cee` |
| Fase 7: Export para Redes | ✅ Completada | `6c7818f` |
| Fase 8: Packaging | ✅ Linux local; Windows/macOS generados en CI | `0b2178d` |
| Fase 9: Polish + E2E | ✅ Completada | `3c0f837` |
| PoC 1: Serial → Widget | ✅ Validado (hardware real) | `0c083cb` |
| PoC 2: Video Sync | ✅ Funcional | `0243314`, `98f8f6a` |
| PoC 3: Video Export | ✅ Funcional | `a86dc5d` |
| PoC 4: Packaging | ✅ Linux local; Windows/macOS en CI | `652c936` |
| PoC 5: Emisor de telemetría (STM32) | ✅ Firmware de prueba | `869d568`, `a9c5d6b` |
| Fase 10: Pendientes (post v1.0.0) | 🟡 En curso (P10.1–P10.4 hechos) | `0ce8d7a` |
