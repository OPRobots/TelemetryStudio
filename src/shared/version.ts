/**
 * Utilidades puras para comparar versiones (semver ligero). Módulo sin
 * dependencias, usable desde `main` y `renderer` y testeable.
 */

/** Parsea `1.2.3` / `v1.2.3` / `1.2.3-beta.1` en sus partes numéricas y prerelease. */
function parseVersion(version: string): { parts: number[]; prerelease: string | null } {
  const clean = version.trim().replace(/^v/i, '');
  const [core, ...rest] = clean.split('-');
  const parts = (core ?? '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  while (parts.length < 3) parts.push(0);
  return { parts, prerelease: rest.length > 0 ? rest.join('-') : null };
}

/**
 * `true` si `latest` es estrictamente más nueva que `current`.
 * Una versión estable supera a la misma versión en prerelease.
 */
export function isNewerVersion(current: string, latest: string): boolean {
  const a = parseVersion(current);
  const b = parseVersion(latest);

  for (let i = 0; i < 3; i++) {
    const currentPart = a.parts[i] ?? 0;
    const latestPart = b.parts[i] ?? 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  if (a.prerelease && !b.prerelease) return true;
  if (!a.prerelease && b.prerelease) return false;
  if (a.prerelease && b.prerelease) return b.prerelease > a.prerelease;
  return false;
}
