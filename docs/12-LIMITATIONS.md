# Limitaciones Conocidas y Known Issues

## P0 — Crítico (bloquea funcionalidad core)

### 1. Vite + serialport: bundling breakage

**Problema**: si Vite intenta bundlear `serialport`, el loader de binarios nativos
`.node` se rompe (`Cannot find module 'serialport'`).

**Resolución**: marcar `serialport`/`@serialport/*` como `external` en la config de
Vite del Main y usar `asarUnpack` del árbol completo del módulo.

```typescript
// electron.vite.config.ts
export default defineConfig({
  main: { build: { rollupOptions: { external: ['serialport', '@serialport/*'] } } },
});
```

### 2. electron-builder v24+ ASAR packing bug

**Problema**: las dependencias JS transitivas de módulos nativos en
`app.asar.unpacked` se pierden
([issue #7451](https://github.com/electron-userland/electron-builder/issues/7451)).

**Resolución**: `asarUnpack` del tree completo:
```yaml
asarUnpack:
  - "node_modules/@serialport/**"
  - "node_modules/serialport/**"
```

---

## P1 — Importante (funciona con workarounds)

### 3. Linux: permisos de puertos serie

**Problema**: sin permisos, `serialport` lanza `PermissionError: [Errno 13]` al abrir
`/dev/ttyUSB0`.

**Resolución**: reglas udev en el paquete (`resources/udev/`) y documentar:
```bash
sudo usermod -a -G dialout $USER   # cerrar sesión y volver a entrar
```

**Chipsets recomendados**: FTDI > CP210x > CDC-ACM > CH340. Evitar
Prolific PL2303HXA en Windows.

### 4. requestVideoFrameCallback — imprecisión de timing

- El callback puede dispararse **1 v-sync tarde** (~16 ms a 60 Hz).
- Si el main thread está ocupado, el navegador puede **saltarse frames** sin callback.
- Frame rate capping: el callback dispara a `min(video_fps, refresh_rate)`.

**Resolución**: usar `mediaTime` (PTS) en lugar de `video.currentTime` y
`presentedFrames` para detectar frames perdidos (implementado en
`src/core/video-synchronizer.ts`).

---

## P2 — Menor

### 5. macOS: DMGs por arquitectura (universal descartado)

**Decisión**: se publican **dos DMGs** (x64 y arm64), no un binario universal. No es
necesario: `@serialport/bindings-cpp` trae un prebuild *fat* (`darwin-x64+arm64`) y
cada DMG usa la rebanada de su arquitectura. Evita el coste de tamaño (~2×) y la
complejidad de `mergeASARs`/`singleArchFiles` con módulos nativos. El sidecar
FFmpeg sí es **universal** (x86_64 + arm64) para servir a ambos DMGs.

**Firma ad-hoc (resuelto)**: Apple Silicon exige una firma de código válida. Sin
certificado, electron-builder no firma y el DMG arm64 mostraba *"la aplicación está
incompleta/dañada"*. Lo resuelve el hook `afterPack`
(`scripts/after-pack-sign.cjs`), que aplica firma ad-hoc (`codesign --sign -`). Al
descargar en otro Mac, Gatekeeper sigue avisando de *desarrollador no identificado*
(clic derecho → Abrir); la solución definitiva es Developer ID + notarización.

### 6. LTTB en la vista completa con datasets enormes (mejora futura)

**Qué ocurre**: al dibujar la **vista completa** (sin zoom) de un dataset que supera
`maxPoints` (2000), `buildSampledData` ejecuta LTTB sobre **todos** los frames. LTTB es
O(n) y corre en el **hilo principal**, así que con datasets muy grandes la UI puede
congelarse un instante. Es un coste **puntual**: gracias al caché solo se recalcula cuando
cambia el dataset (carga o crecimiento), no en cada frame de vídeo.

**Cuándo sería necesario un Worker** (casos concretos):
- Vista **sin zoom** de un dataset con **cientos de miles a millones** de frames
  (a partir de ~500k empieza a notarse; >1M ⇒ ~1,5 s de bloqueo).
- Que ese cálculo coincida con interacción del usuario (carga inicial o streaming vivo).

**Por qué NO es necesario en este proyecto** (tamaños realistas):
- A 100 Hz, una sesión de 10 min ≈ **60k frames** (LTTB < 10 ms).
- Al máximo documentado (1 kHz), 10 min ≈ **600k frames** (~90 ms, aceptable).
- Llegar a 1M exigiría ~16 min a 1 kHz o ~2,8 h a 100 Hz, fuera del uso previsto.
- Y **con zoom** ya está resuelto: se muestrea solo la ventana visible (O(ventana)).

**Cómo se haría** (si algún día hiciera falta): mover solo el LTTB de vista completa a un
**Web Worker**, enviando únicamente los valores del campo base (p. ej. un `Float32Array`, no
los frames completos) y devolviendo los índices seleccionados; el hilo principal mapea
x/series y aplica solo el último resultado (descartando respuestas obsoletas). Con fallback
síncrono si el worker no está disponible.

### 7. Windows ARM64: drivers serial

Recomendar cable con chipset CP210x (soporte vía Windows Update). Prolific
PL2303HXA (legacy) no tiene soporte.

---

## Estado Funcional (implementación actual)

### F-01 — Flujo principal verificado con simulador; hardware real pendiente

Cubierto por e2e en Electron (`npm run e2e`): `e2e:serial` (descubrimiento de
campos, auto-layout y dibujo) y `e2e:video` (sync por timestamp). El pipeline
Serial con hardware STM32 real se validó en el PoC 1; queda pendiente la
validación con el robot físico y un vídeo de producción por parte del usuario.

**Probar sin hardware**: `examples/README.md` (socat + `examples/serial-simulator.mjs`).

### F-02 — Comparación en paralelo implementada

`ComparisonManager` valida que los widgets sean idénticos y `SplitView` muestra dos
paneles **en paralelo** (A izquierda / B derecha, divisor vertical), cada uno con su
vídeo, su `VideoSynchronizer` (`comparison:frame`) y sus widgets. La reproducción es
**siempre simétrica** (barra compartida guiada por el panel con vídeo), con **scroll
de widgets, cursor y zoom sincronizados**. Soporta sesiones sin vídeo (placeholder
alineado) y cierre de vídeo por panel. e2e: `e2e:comparison`, `e2e:comparison-reset`.

### F-03 — Exportación de vídeo con editor de board (FFmpeg sidecar)

`src/shared/export-composition.ts` (puro) calcula el layout de la composición:
**un único board** (sin plantillas) con `videoMode` (`Oculto · Primer plano ·
Segundo plano`), panel, y empaquetado **staggered (skyline)** que rellena huecos;
el vídeo conserva siempre su aspecto. `ExportStage` monta los widgets a tamaño de
celda en un host oculto y **captura su canvas** (dibujo síncrono, sin depender de
`rAF`); los frames van como **raw RGBA** a `src/main/export-service.ts` (FFmpeg
sidecar o del PATH), que escribe **directo** en la ruta elegida. El `ExportDialog`
es un **asistente de 2 pasos** (layout/salida) con **previsualización** y
**copyright** en el vídeo; requiere **telemetría cargada** (el vídeo es opcional),
el **rango de exportación** se ajusta con un **slider start–end** sobre la duración
del vídeo (con la **banda amarilla** de telemetría fija; por defecto 2 s
antes/después de los datos) y el **FPS** se elige entre 30 y 60. La salida está
fijada a **MP4/H.264** en la UI (`webm`/VP9 existen en el tipo pero no se ofrecen).
Tests: modelo de composición y argumentos (unit), MP4 real con ffprobe (integración)
y composición/cancelación del renderer (e2e).

### F-04 — Editor de layout con arrastre y redimensionado

Los widgets se colocan en una **rejilla fluida de 12 columnas**: se redimensionan
arrastrando el asa derecha (presets de ancho) o inferior (filas) y se reordenan
arrastrando la cabecera. El diálogo de configuración permite además ajustar ancho,
alto, campos y opciones.

### F-05 — Redibujado de widgets (resuelto)

Resuelto: `WidgetHost` ya no guarda el frame en estado React. Los widgets se
redibujan imperativamente vía `FrameBus` + `useWidgetDraw` (coalescido por rAF), y
`StateTimeline`/`Minimap2D` cachean su capa estática. Medido con
`npm run e2e:perf` (ver ROADMAP P10.3).

### F-06 — Empaquetado multiplataforma

`electron-builder.yml` configurado (extraResources de FFmpeg universal y udev),
con workflow de CI que genera los instaladores de las 3 plataformas. macOS genera
dos DMGs (x64 y arm64) con firma **ad-hoc**, por lo que el arm64 arranca en Apple
Silicon (tamaños medidos: arm64 ~199 MB, x64 ~206 MB); Windows genera NSIS +
portable. Los tamaños de Linux/Windows quedan pendientes de confirmar.

### F-07 — Vídeos HEVC/H.265 se convierten automáticamente

Chromium (Electron) no decodifica HEVC/H.265 en Linux, por lo que esos vídeos
cargaban sin imagen. Al cargar un vídeo, `src/main/video-service.ts` lo detecta con
`ffprobe` y, si el códec no es reproducible, lo **transcodea a H.264** antes de
reproducirlo (la autorrotación de FFmpeg corrige además los vídeos verticales).
Mientras convierte se muestra `PrepareVideoDialog` con progreso y opción de cancelar.

---

## Resumen de Acciones

| Prioridad | Issue | Acción |
|---|---|---|
| **P0** | Vite + serialport | `external` + `asarUnpack` |
| **P0** | ASAR packing bug | `asarUnpack` del tree completo |
| **P1** | Linux serial permissions | reglas udev + grupo `dialout` |
| **P1** | RVFC timing | usar `mediaTime` (PTS) |
| **P2** | macOS universal | descartado: DMGs por arquitectura (x64/arm64) |
| **P0** | macOS arm64 no arranca | firma ad-hoc vía hook `afterPack`; FFmpeg universal |
| **P2** | LTTB vista completa >1M | ventana visible al hacer zoom (hecho); Worker = mejora futura documentada |
| **P3** | Windows ARM64 serial | recomendar CP210x |
