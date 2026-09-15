# PoC 4: Packaging — serialport en 3 Plataformas

App Electron mínima que lista puertos serie. Objetivo: validar que `serialport` (módulo nativo C++) se empaqueta correctamente.

## Build Instructions

### Opción 1: Desde esta carpeta (standalone)

```bash
cd pocs/04-packaging
npm install
npm run build:linux    # o build:mac, build:win
# Los builds se generan en release/
```

### Opción 2: Desde la raíz del proyecto

```bash
cd OPRobots-TelemetryPlayer
npm install
npm run build:linux    # o build:mac, build:win
# Los builds se generan en release/
```

### Requisitos
- Node.js 22+ y npm
- `serialport` se compila automáticamente para la plataforma destino
- No se necesitan herramientas adicionales (electron-builder descarga todo)

### Linux: serial sin root
En Linux, para acceder a puertos serie sin permisos de administrador:
```bash
sudo cp examples/udev/69-oprobots-serial.rules /etc/udev/rules.d/
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
