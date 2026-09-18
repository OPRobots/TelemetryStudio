import { describe, it, expect } from 'vitest';
import {
  KeyValueParser,
  CsvParser,
  MacroArrayParser,
  DEFAULT_CSV_FIELDS,
} from '@parsers/serial';

describe('KeyValueParser', () => {
  it('parsea clave:valor con timestamp', () => {
    const p = new KeyValueParser(true);
    const f = p.parseLine('T:1234,speed:1500,battery:85.5,armed:true')!;
    expect(f.timestamp_ms).toBe(1234);
    expect(f.data.speed).toBe(1500);
    expect(f.data.battery).toBe(85.5);
    expect(f.data.armed).toBe(true);

    const schema = p.getDiscoveredSchema();
    expect(schema.map((s) => s.name)).toEqual(['speed', 'battery', 'armed']);
    expect(schema[1]!.type).toBe('number');
    expect(schema[2]!.type).toBe('boolean');
  });

  it('infiere bitmask desde hex y amplía el ancho', () => {
    const p = new KeyValueParser(true);
    p.parseLine('T:0,ir:0xFF');
    p.parseLine('T:10,ir:0x001FFE');
    const ir = p.getDiscoveredSchema().find((s) => s.name === 'ir')!;
    expect(ir.type).toBe('bitmask');
    expect(ir.bitmaskWidth).toBe(24);
  });

  it('asciende number → bitmask al aparecer un hex', () => {
    const p = new KeyValueParser(true);
    p.parseLine('T:0,ir:255');
    expect(p.getDiscoveredSchema()[0]!.type).toBe('number');
    p.parseLine('T:10,ir:0xFF');
    expect(p.getDiscoveredSchema()[0]!.type).toBe('bitmask');
  });

  it('interpreta etiquetas string', () => {
    const p = new KeyValueParser(true);
    const f = p.parseLine('T:0,state:RUNNING,speed:100')!;
    expect(f.data.state).toBe('RUNNING');
    expect(p.getDiscoveredSchema().find((s) => s.name === 'state')!.type).toBe('string');
  });

  it('ignora tokens malformados', () => {
    const p = new KeyValueParser(true);
    const f = p.parseLine('T:0,speed:100,garbage=,battery:50')!;
    expect(f.data.speed).toBe(100);
    expect(f.data.battery).toBe(50);
  });

  it('rechaza líneas sin timestamp cuando se exige', () => {
    const p = new KeyValueParser(true);
    expect(p.parseLine('speed:100')).toBeNull();
    expect(p.parseLine('T:abc,speed:1')).toBeNull();
    expect(p.parseLine('')).toBeNull();
  });

  it('sin timestamp usa el índice de muestra (un frame por línea)', () => {
    const p = new KeyValueParser(false);
    const f0 = p.parseLine('speed:100,battery:50')!;
    const f1 = p.parseLine('speed:110,battery:49')!;
    expect(f0.timestamp_ms).toBe(0);
    expect(f1.timestamp_ms).toBe(1);
  });
});

describe('CsvParser', () => {
  it('parsea con etiquetas y timestamp', () => {
    const p = new CsvParser(true, ',', ['accX', 'accY']);
    const f = p.parseLine('1000,1.2,2.3')!;
    expect(f.timestamp_ms).toBe(1000);
    expect(f.data.accX).toBeCloseTo(1.2);
    expect(f.data.accY).toBeCloseTo(2.3);
  });

  it('valida estrictamente el número de columnas', () => {
    const p = new CsvParser(true, ',', ['a', 'b']);
    expect(p.strict).toBe(true);
    expect(p.parseLine('1,2')).toBeNull(); // faltan columnas
    expect(p.parseLine('1,2,3,4')).toBeNull(); // sobran
    expect(p.parseLine('x,2,3')).toBeNull(); // timestamp no numérico
  });

  it('soporta separadores ; y espacio', () => {
    const sc = new CsvParser(true, ';', ['a', 'b']);
    expect(sc.parseLine('5;1;2')!.data.a).toBe(1);
    const sp = new CsvParser(true, ' ', ['a', 'b']);
    expect(sp.parseLine('5   1   2')!.data.a).toBe(1);
  });

  it('sin timestamp usa el índice de muestra', () => {
    const p = new CsvParser(false, ',', ['a', 'b']);
    expect(p.parseLine('1,2')!.timestamp_ms).toBe(0);
    expect(p.parseLine('3,4')!.timestamp_ms).toBe(1);
  });

  it('infiere bitmask desde hex', () => {
    const p = new CsvParser(true, ',', ['ir', 'speed']);
    p.parseLine('0,0x0F,100');
    expect(p.getDiscoveredSchema().find((s) => s.name === 'ir')!.type).toBe('bitmask');
  });

  it('expone los campos CSV por defecto', () => {
    expect(DEFAULT_CSV_FIELDS).toContain('accX');
  });
});

describe('MacroArrayParser', () => {
  it('agrupa por repetición del primer campo (sin timestamp)', () => {
    const p = new MacroArrayParser(false);
    p.parseLine('>a:1');
    p.parseLine('>b:2');
    p.parseLine('>c:3');
    const closed = p.parseLine('>a:4')!;
    expect(closed.timestamp_ms).toBe(0);
    expect(closed.data).toEqual({ a: 1, b: 2, c: 3 });

    p.parseLine('>b:5');
    p.parseLine('>c:6');
    p.completeStream();

    expect(p.frameCount).toBe(2);
    const frames = p.buildDataset('m').frames;
    expect(frames[1]!.data).toEqual({ a: 4, b: 5, c: 6 });
    expect(frames[1]!.timestamp_ms).toBe(1);
  });

  it('usa el campo t como timestamp del grupo', () => {
    const p = new MacroArrayParser(true);
    p.parseLine('>t:1000');
    p.parseLine('>a:1');
    p.parseLine('>b:2');
    const closed = p.parseLine('>t:1010')!;
    expect(closed.timestamp_ms).toBe(1000);
    expect(closed.data).toEqual({ a: 1, b: 2 });
  });

  it('rechaza líneas sin prefijo >', () => {
    const p = new MacroArrayParser(false);
    expect(p.parseLine('a:1')).toBeNull();
    expect(p.parseLine('>a')).toBeNull();
  });
});
