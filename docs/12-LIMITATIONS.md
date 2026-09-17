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

### 5. macOS Universal Binary con serialport

**Resolución**: prebuilds universales de `@serialport/bindings-cpp` + `mergeASARs`
y `singleArchFiles: "node_modules/@serialport/**/*.node"`.

### 6. LTTB a >1M puntos bloquea el main thread (pendiente)

LTTB es O(n): con 10M puntos tarda ~1,5 s. Mitigación futura: ejecutarlo en un
Worker o muestrear solo la ventana visible. Hoy el chart muestrea el dataset
completo con `maxPoints` (2000) y es fluido para los tamaños habituales.

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

### F-03 — Exportación de vídeo implementada (FFmpeg sidecar)

`src/services/video-exporter.ts` compone vídeo + widgets + overlay en un canvas y
envía los frames como **raw RGBA** a `src/main/export-service.ts`, que ejecuta
FFmpeg (sidecar empaquetado o del PATH). Tests: argumentos (unit), MP4 real con
ffprobe (integración) y composición del renderer (e2e).

### F-04 — Editor de layout con arrastre y redimensionado

Los widgets se colocan en una **rejilla fluida de 12 columnas**: se redimensionan
arrastrando el asa derecha (presets de ancho) o inferior (filas) y se reordenan
arrastrando la cabecera. El diálogo de configuración permite además ajustar ancho,
alto, campos y opciones.

### F-05 — WidgetHost re-renderiza en cada frame (pendiente de optimizar)

`WidgetHost` guarda el frame actual en estado de React, provocando un re-render por
frame. Con pocos widgets es fluido; si el número crece, conviene migrar a
actualizaciones imperativas por `ref`.

### F-06 — Empaquetado multiplataforma

`electron-builder.yml` configurado (extraResources de FFmpeg y udev), con workflow
de CI preparado. Build Linux verificado (`--dir` arranca; AppImage ~109 MB, deb
~75 MB). Windows y macOS quedan como build manual hasta disponer de esas
plataformas o de un repo remoto.

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
| **P2** | macOS universal | `singleArchFiles` para `.node` |
| **P2** | LTTB >1M | Worker / ventana visible (pendiente) |
| **P3** | Windows ARM64 serial | recomendar CP210x |
