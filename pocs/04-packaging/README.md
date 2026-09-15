# PoC 4: Packaging — serialport en 3 Plataformas

App Electron mínima que lista puertos serie. Objetivo: validar que `serialport` (módulo nativo C++) se empaqueta correctamente.

## Build Instructions

### Linux
```bash
npm ci
npm run build:linux
# Ejecutar (el wrapper maneja FUSE automáticamente):
./pocs/04-packaging/run-oprobots.sh
# O directamente si FUSE está instalado:
./dist/*.AppImage
```

### macOS
```bash
npm ci
npm run build:mac
# Abrir el .dmg generado en dist/
```

### Windows
```bash
npm ci
npm run build:win
# Ejecutar el .exe (NSIS installer o portable) en dist/
```

### Requisitos
- Node.js 22+ y npm
- `serialport` se compila automáticamente para la plataforma destino
- No se necesitan herramientas adicionales (electron-builder descarga todo)

### Linux: sin FUSE
Si FUSE no está instalado, usar el wrapper `run-oprobots.sh` que auto-extrae el AppImage:
```bash
./pocs/04-packaging/run-oprobots.sh
```
O instalar FUSE: `sudo pacman -S fuse2`

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
