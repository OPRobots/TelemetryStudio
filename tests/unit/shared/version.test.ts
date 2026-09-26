import { describe, it, expect } from 'vitest';
import { isNewerVersion } from '@shared/version';

describe('isNewerVersion', () => {
  it('detecta versiones mayores/menores/parches', () => {
    expect(isNewerVersion('1.0.0', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.1.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(false);
  });

  it('ignora la "v" inicial y compara numéricamente', () => {
    expect(isNewerVersion('1.0.0', 'v1.0.1')).toBe(true);
    expect(isNewerVersion('v1.2.0', '1.10.0')).toBe(true);
    expect(isNewerVersion('1.10.0', '1.2.0')).toBe(false);
  });

  it('no considera nueva la misma versión', () => {
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(isNewerVersion('v1.0.0', '1.0.0')).toBe(false);
  });

  it('la versión estable supera a la misma en prerelease', () => {
    expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0-beta')).toBe(false);
  });

  it('compara prereleases entre sí', () => {
    expect(isNewerVersion('1.0.0-beta.1', '1.0.0-beta.2')).toBe(true);
    expect(isNewerVersion('1.0.0-beta.2', '1.0.0-beta.1')).toBe(false);
  });

  it('tolera versiones incompletas', () => {
    expect(isNewerVersion('1', '1.0.1')).toBe(true);
    expect(isNewerVersion('1.0', '1.0.0')).toBe(false);
  });
});
