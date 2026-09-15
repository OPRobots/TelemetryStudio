# PoC 4: Packaging — serialport en 3 Plataformas

App Electron mínima que lista puertos serie. Objetivo: validar que `serialport` (módulo nativo C++) se empaqueta correctamente.

## IMPORTANTE

**Todos los comandos se ejecutan desde la raíz del proyecto** (`OPRobots-TelemetryPlayer/`), NO desde esta carpeta.

Si copias el proyecto a otro ordenador, copia la **carpeta completa del proyecto**, no solo esta carpeta.

## Build Instructions

### Linux
```bash
cd OPRobots-TelemetryPlayer
npm install
npm run build:linux
# Ejecutar:
./release/*.AppImage
```

### macOS
```bash
cd OPRobots-TelemetryPlayer
npm install
npm run build:mac
# Abrir el .dmg generado en release/
```

### Windows
```bash
cd OPRobots-TelemetryPlayer
npm install
npm run build:win
# Ejecutar el .exe (NSIS installer o portable) en release/
```

### Requisitos
- Node.js 22+ y npm
- `serialport` se compila automáticamente para la plataforma destino
- No se necesitan herramientas adicionales (electron-builder descarga todo)

### Linux: serial sin root
En Linux, para acceder a puertos serie sin permisos de administrador:
```bash
sudo cp pocs/04-packaging/examples/udev/69-oprobots-serial.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger
sudo usermod -a -G dialout $USER
# Cerrar sesión y volver a entrar
```

### Criterios de éxito
- [ ] Build exitoso en las 3 plataformas
- [ ] La app empaquetada abre correctamente
- [ ] `SerialPort.list()` retorna puertos disponibles
- [ ] Tamaño del paquete < 200 MB
