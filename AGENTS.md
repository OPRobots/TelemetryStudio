# AGENTS.md — Guía para Agentes de IA

## Identidad del Proyecto

**OPRobots Telemetry Studio** — Aplicación de escritorio multiplataforma para análisis de telemetría de robots de competición con vídeo sincronizado.

- **Stack**: Electron 34, React 19, TypeScript 5.6, uPlot 1.6, Zustand 5, Tailwind CSS 4
- **Build**: electron-vite 2.x, electron-builder 25.x
- **Tests**: Vitest
- **Plataformas**: Windows, macOS, Linux (100% offline, portable)

## Arquitectura

```
Main Process (Node.js) ←→ Renderer Process (Chromium) ←→ Worker Threads
```

- **Main**: lifecycle, serialport, sesiones, exportación
- **Renderer**: UI (React), sincronización vídeo, EventBus, widgets (Canvas 2D + uPlot)
- **Workers**: exportación de vídeo

Regla estricta: **nunca** importar desde `renderer/` hacia `main/` o `workers/`. Comunicación exclusivamente via IPC.

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
- Hooks personalizados en `src/renderer/hooks/`
- Estado global con Zustand stores

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
- Cada widget implementa `ITelemetryWidget`

## Paleta de Colores — Dark Theme

### Fondos
```
#0a0e17  ← Fondo principal (más oscuro)
#111827  ← Paneles, cards
#1a1f2e  ← Sidebar, elementos elevados
#1e293b  ← Bordes, separadores
```

### Acentos Azul (Primario)
```
#193773  ← Azul oscuro principal (botones, headers)
#2563eb  ← Hover states
#3b82f6  ← Elementos activos, links
#60a5fa  ← Texto sobre fondo oscuro
```

### Acentos Amarillo (Alertas)
```
#F2BE22  ← Avisos, warnings
#fbbf24  ← Hover warnings
#f59e0b  ← Texto de warning
```

### Acentos Rojo (Errores)
```
#F20519  ← Errores críticos
#ef4444  ← Hover errores
#dc2626  ← Texto de error
```

### Texto
```
#e2e8f0  ← Texto primario
#94a3b8  ← Texto secundario
#64748b  ← Texto terciario, placeholders
#475569  ← Texto deshabilitado
```

### Reglas de Color
- Usar colores con criterio: azul = navegación/acción, amarillo = advertencia, rojo = error
- No abusar de animaciones: solo transiciones suaves (150-300ms) para hover/focus
- Sin gradientes neón, sin glow excesivo, sin partículas decorativas
- Exceptions: LED glow en DigitalBitmask (funcional, no decorativo)

## Testing

### Framework
- **Vitest** para unit tests e integration tests
- **Playwright** para e2e tests (Fase 9)

### Cobertura Objetivo
- Core (EventBus, TelemetryStore, binary search, LTTB, ComparisonManager): **80%**
- Parsers (SerialUART, JSONSession): **70%**
- Widgets: tests de renderizado básico

### Antes de Cada Commit
```bash
npm run test       # Todos los tests pasan
npm run typecheck  # Sin errores de TypeScript
npm run lint       # Sin errores de ESLint (cuando esté configurado)
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
workers/   ← Depende de core/ y shared/
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
- **Serial siempre con vídeo**: Se carga vídeo primero, luego streaming serial

## Flujo de Trabajo

### Flujo A — Serial + Vídeo
1. Cargar .mp4 → 2. Conectar serial → 3. Esperar fin del stream → 4. Configurar widgets → 5. Calibrar sync → 6. Analizar

### Flujo B — Sesión Guardada
1. Cargar session.json → 2. Restaurar todo automáticamente

### Flujo C — Comparación
1. Cargar sesión A → 2. Cargar sesión B → 3. Validar widgets idénticos → 4. Interfaz duplicada verticalmente

## Documentación

Toda la documentación vive en `docs/`:

| Archivo | Contenido |
|---|---|
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
npm run lint         # ESLint (pendiente configurar)
```

### Estado del Proyecto

| Fase | Estado | Commits |
|---|---|---|
| Fase 0: Setup | ✅ Completada | `792cf03` |
| Fase 1: Core Data Engine | ⏳ Pendiente | — |
| PoC 1: Serial → Widget | ⏳ En progreso | `639ce0c` |
| PoC 2: Video Sync | ⏳ Pendiente | — |
| PoC 3: Video Export | ⏳ Pendiente | — |
| PoC 4: Packaging | ⏳ Pendiente | — |
