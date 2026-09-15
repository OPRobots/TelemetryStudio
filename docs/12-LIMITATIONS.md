# Limitaciones Conocidas y Known Issues

## P0 — Crítico (Bloquea funcionalidad core)

### 1. mp4-muxer / webm-muxer deprecados

**Estado**: `mp4-muxer` v5.2.2 y `webm-muxer` v5.1.4 fueron deprecados en julio 2025.

**Impacto**: No se recibirán fixes de bugs ni nuevos features.

**Resolución**: Migrar a **Mediabunny** (mediabunny.dev, v1.55+). API diferente:
- `Muxer` → `Output`
- Tracks se añaden después de instanciar
- `start()` requerido antes de enviar datos
- Muchos métodos ahora son `async` (backpressure)

**Referencia**: [Migración mp4-muxer → Mediabunny](https://github.com/Vanilagy/mp4-muxer/blob/HEAD/MIGRATION-GUIDE.md)

---

### 2. Vite + serialport: Bundling breakage

**Problema**: Si Vite intenta bundlear `serialport`, el loader de binarios nativos `.node` se rompe.

**Error típico**:
```
Error: Cannot find module 'serialport'
```

**Resolución**: Marcar `serialport` como `external` en TODAS las configs de Vite:

```typescript
// electron.vite.config.ts
export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['serialport', '@serialport/*'],
      },
    },
  },
});
```

**Referencia**: [electron-vite docs](https://electron-vite.org/guide/dev), [vite-plugin-electron README](https://github.com/electron-vite/vite-plugin-electron)

---

### 3. electron-builder v24+ ASAR packing bug

**Problema**: Las dependencias JS transitivas de módulos nativos en `app.asar.unpacked` se pierden.

**GitHub Issue**: [electron-userland/electron-builder#7451](https://github.com/electron-userland/electron-builder/issues/7451)

**Resolución**: Usar `asarUnpack` del tree completo y evitar el paquete `hazardous`:
```yaml
asarUnpack:
  - "node_modules/@serialport/**"
  - "node_modules/serialport/**"
```

---

## P1 — Importante (Funciona pero con workarounds)

### 4. Linux: Permisos de puertos serie

**Problema**: Sin permisos, `serialport` lanza `PermissionError: [Errno 13]` al abrir `/dev/ttyUSB0`.

**Resolución**: Incluir reglas udev en el paquete de distribución (ver `docs/11-PACKAGING.md`). Documentar en el README que el usuario debe:
```bash
sudo usermod -a -G dialout $USER
# Cerrar sesión y volver a entrar
```

**Chipset recomendados por fiabilidad**:
1. FTDI (FT232R, FT232H) — funciona en todas las plataformas
2. SiLabs CP210x — driver incluido en macOS via DEXT
3. CDC-ACM (USB-C) — zero-driver en todos los OS
4. CH340 — barato, funcional, drivers menos pulidos en Windows

**Evitar**: Prolific PL2303HXA en Windows (driver rechaza chips "counterfeit").

---

### 5. WebCodecs encodeQueueSize overflow

**Problema**: Si se renderizan frames a 30fps pero se codifican a <10fps (hardware limitado), `encodeQueueSize` crece indefinidamente hasta crash por memoria.

**Resolución**: Siempre verificar antes de codificar:
```typescript
if (encoder.encodeQueueSize > 2) {
  frame.close(); // Drop este frame
  droppedFrames++;
  continue;
}
encoder.encode(frame, { keyFrame: frameCounter % 150 === 0 });
frame.close(); // SIEMPRE liberar
```

**Benchmark de referencia**:
| Dispositivo | H.264 Encode FPS (1080p30) |
|---|---|
| Windows netbook (low) | 11 fps |
| Samsung Chromebook | 60 fps |
| Ubuntu Lenovo (mid) | 100 fps |
| MacBook Pro M4 | 200 fps |

---

### 6. requestVideoFrameCallback timing imprecision

**Limitaciones**:
- Callback puede dispararse **1 v-sync tarde** (~16ms en 60Hz)
- Si el main thread está ocupado, el browser puede **saltarse frames** sin disparar el callback
- Frame rate capping: callback dispara a `min(video_fps, browser_refresh_rate)`

**Resolución**: Usar `mediaTime` (PTS) en lugar de `video.currentTime` para identificación de frames. Usar `presentedFrames` para detectar frames perdidos.

**Referencia**: [WICG/video-rvfc#69](https://github.com/WICG/video-rvfc/issues/69) — Feature request para callback obligatorio (denegado)

---

## P2 — Menor (Funciona con limitaciones)

### 7. macOS Universal Binary con serialport

**Problema**: Binarios `.node` de serialport compilados para una arquitectura no funcionan en la otra.

**Resolución**: Usar prebuilds universales de `@serialport/bindings-cpp` (disponibles para `darwin-x64+arm64`) y configurar:
```yaml
mac:
  mergeASARs: true
  singleArchFiles: "node_modules/@serialport/**/*.node"
```

---

### 8. LTTB a >1M puntos bloquea main thread

**Problema**: LTTB es O(n). Con 10M puntos, toma ~1500ms en un M1, bloqueando la UI.

**Resolución**:
- Ejecutar LTTB en **Web Worker** o **Worker Thread**
- Usar `lttb-js` streaming para datasets >10M puntos
- Downsample solo la ventana visible, no el dataset completo

**Benchmark**:
| Input Points | Downsample a 1000 | Tiempo |
|---|---|---|
| 10K | 1,000 | ~2ms |
| 100K | 1,000 | ~15ms |
| 1M | 1,000 | ~150ms |
| 10M | 1,000 | ~1,500ms |

---

### 9. OffscreenCanvas + OOP iframe en Electron

**Problema**: Transferir `OffscreenCanvas` o `VideoFrame` entre OOP iframes y la ventana principal via `postMessage` causa crash del renderer en Electron (funciona en Chrome normal).

**GitHub Issue**: [electron/electron#47705](https://github.com/electron/electron/issues/47705) (julio 2025)

**Resolución**: Evitar cross-origin canvas transfer. Mantener todo el rendering de widgets en el mismo contexto del renderer.

---

### 10. Windows ARM64 serial drivers

**Chipset con mejor soporte ARM64**:
| Chipset | Estado ARM64 |
|---|---|
| SiLabs CP210x | ✅ Via Windows Update |
| FTDI | ⚠️ Driver existe, instalación manual |
| CH340/CH343 | ⚠️ Disponible, calidad variable |
| Prolific PL2303 (REV_05+) | ✅ v4.6.0.0+ |
| **Prolific PL2303HXA (legacy)** | ❌ Sin soporte. Reemplazar cable. |

**Recomendación**: Para usuarios Windows ARM64, recomendar cable con chipset CP210x.

---

## Estado Funcional (implementación actual)

### F-01 — Flujo principal verificado con simulador, pendiente hardware real

**Estado**: El flujo completo (vídeo + Serial + widgets + sincronización + layouts)
está cubierto por tests automáticos en Electron (`npm run e2e`):
- `e2e:serial` conecta un Serial simulado, verifica el descubrimiento de campos,
  la auto-configuración de widgets y que la gráfica dibuja datos.
- `e2e:video` abre un vídeo, lo seekea y comprueba que la telemetría se sincroniza
  por timestamp (1.0 s de vídeo → 1000 ms de telemetría con offset 0).

El pipeline Serial con hardware STM32 real fue validado en PoC 1. La validación con
el robot físico y un vídeo de producción queda pendiente por parte del usuario.

**Cómo probar sin hardware**: ver `examples/README.md` (simulador `socat` +
`examples/serial-simulator.mjs`).

### F-02 — Comparación side-by-side implementada

**Estado**: implementada en la Fase 5. `ComparisonManager` valida que los widgets
sean idénticos y `SplitView` muestra dos paneles apilados, cada uno con su vídeo,
su `VideoSynchronizer` (`comparison:frame`, dataset de comparación) y sus widgets.
Incluye toggle de barra compartida/independiente y e2e (`e2e:comparison`).

### F-03 — Exportación de vídeo implementada (FFmpeg sidecar)

**Estado**: implementada en la Fase 7. `src/services/video-exporter.ts` compone
vídeo + widgets + overlay en un canvas y envía frames raw RGBA a
`src/main/export-service.ts`, que ejecuta FFmpeg (sidecar empaquetado o del
PATH). Tests: argumentos (unit), MP4 real con ffprobe (integración) y
composición del renderer (e2e).

### F-04 — Editor de layout basado en formularios, no drag & resize

**Estado**: Los widgets se colocan con coordenadas numéricas (columna/fila/ancho/alto)
en el diálogo de configuración. No hay arrastre ni redimensionado con el ratón.

### F-05 — WidgetHost re-renderiza en cada frame

**Estado**: `WidgetHost` guarda el frame actual en estado de React, provocando un
re-render por frame. Con pocos widgets es fluido; si el número crece, conviene
migrar a actualizaciones imperativas por ref.
### F-06 — Empaquetado multiplataforma

**Estado**: `electron-builder.yml` configurado (extraResources de FFmpeg y udev),
icono placeholder e workflow de CI preparado. Build Linux verificado
(`--dir` arranca; AppImage ~109 MB, deb ~75 MB con el PoC 4). Windows y macOS
quedan como build manual hasta disponer de repo remoto/CI o de esas plataformas.

### F-07 — Vídeos HEVC/H.265 se convierten automáticamente

**Estado**: resuelto. Chromium (Electron) **no decodifica HEVC/H.265** en Linux
(`canPlayType('...hvc1...')` devuelve vacío), por lo que los vídeos grabados con
móvil en ese códec cargaban metadata (`duration`) pero con `videoWidth=0` y sin
imagen. Al cargar un vídeo, `src/main/video-service.ts` lo detecta con `ffprobe`
y, si el códec no es reproducible (`isPlayableVideoCodec`), lo **transcodea a
H.264** (`buildTranscodeArgs`) antes de reproducirlo. La autorrotación de FFmpeg
corrige además los vídeos verticales (rotación en metadata). Mientras convierte se
muestra un **diálogo con barra de progreso y opción de cancelar**
(`PrepareVideoDialog`), con el progreso reportado por FFmpeg (`-progress`).

---

## Resumen de Acciones

| Prioridad | Issue | Acción |
|---|---|---|
| **P0** | mp4-muxer deprecated | Migrar a Mediabunny |
| **P0** | Vite + serialport | `external` en todas las configs |
| **P0** | ASAR packing bug | `asarUnpack` tree completo |
| **P1** | Linux serial permissions | udev rules + grupo `dialout` |
| **P1** | encodeQueueSize overflow | Check `> 2` antes de encode |
| **P1** | RVFC timing | Usar `mediaTime` (PTS) |
| **P2** | macOS universal | `singleArchFiles` para `.node` |
| **P2** | LTTB >1M | Worker Thread |
| **P2** | OffscreenCanvas OOP | No cross-origin transfer |
| **P3** | Windows ARM64 serial | Recomendar CP210x |
