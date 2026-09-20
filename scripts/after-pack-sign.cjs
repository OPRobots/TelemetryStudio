'use strict';
/**
 * Hook `afterPack` de electron-builder.
 *
 * En macOS firma la app en modo *ad-hoc* (`codesign --sign -`). Sin esto, el
 * bundle queda con la firma original del binario de Electron (a la que
 * electron-builder le cambia Info.plist, helpers y nombre), lo que en Apple
 * Silicon produce el error "la aplicación está incompleta/no se puede abrir".
 * Intel es más permisivo y por eso el DMG x64 arranca igualmente.
 *
 * Corre después de escribir app.asar/integridad ASAR y antes de crear el DMG,
 * así que la firma válida queda dentro del artefacto. Si algún día se configura
 * un certificado real se puede eliminar este hook.
 */
const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  await execFileAsync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
  console.log(`[after-pack-sign] Firma ad-hoc aplicada a ${appPath}`);
};
