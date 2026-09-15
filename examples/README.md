# Ejemplos y pruebas manuales

## Simulador de Serial

El firmware STM32 de referencia (`pocs/01-serial-widget/examples/stm32_telemetry.c`) emite
líneas CSV posicionales:

```
timestamp_ms,accX,accY,accZ,gyroX,gyroY,gyroZ,battery
```

Para probar el flujo completo sin hardware, se puede crear un par de puertos serie
virtuales con `socat` y alimentar uno con el simulador:

```bash
# 1. Crear par de PTYs enlazados
socat -d -d pty,raw,echo=0,link=/tmp/ttyV0 pty,raw,echo=0,link=/tmp/ttyV1

# 2. En otra terminal, enviar telemetría al segundo extremo
node examples/serial-simulator.mjs /tmp/ttyV1 50

# 3. En la app: "Conectar Serial" → puerto /tmp/ttyV0, baud 115200
```

El campo "Campos CSV" del diálogo de conexión permite adaptar los nombres de columna
a cualquier robot. Por defecto usa `accX, accY, accZ, gyroX, gyroY, gyroZ, battery`.

## Vídeo de prueba

Hay un vídeo de ejemplo en `pocs/02-video-sync/examples/mock_video.mp4`. Se puede usar
para validar la sincronización y las gráficas.

## Formatos de línea aceptados

| Formato | Ejemplo |
|---|---|
| CSV posicional (firmware STM32) | `1000,1.20,2.30,9.80,10.0,-5.0,0.0,99.5` |
| Legacy con letras | `T:1234,S:1500,M:512,-510,G:15` |
| Genérico con claves | `T:1234,speed_rpm:1500,battery:85.5,armed:true` |

En todos los casos el **primer valor es el timestamp en milisegundos** y es el que se
usa para sincronizar la telemetría con el vídeo.
