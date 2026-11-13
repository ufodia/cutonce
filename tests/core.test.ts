import { describe, expect, it } from 'vitest';
import {
  exportPrintHtml,
  exportSvg,
  nest,
  pointInPolygon,
  polygonArea,
  sampleProject,
  validateProject,
  type Project,
} from '../src/core';

function rectangle(width: number, height: number): Project {
  return {
    version: 1,
    name: 'Test board',
    calibrated: true,
    board: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    defects: [],
    kerf: 0,
    step: 1,
    parts: [{ id: 'part', name: 'Part', width: 20, height: 20, quantity: 1, canRotate: false }],
  };
}

describe('polygon geometry', () => {
  it('computes unsigned areas in either winding and includes boundary points', () => {
    const p = rectangle(30, 20).board;
    expect(polygonArea(p)).toBe(600);
    expect(polygonArea([...p].reverse())).toBe(600);
    expect(pointInPolygon({ x: 0, y: 10 }, p)).toBe(true);
    expect(pointInPolygon({ x: 31, y: 10 }, p)).toBe(false);
  });

  it('refuses a rectangle that bridges a concave notch despite four contained corners', () => {
    const p = rectangle(100, 100);
    p.board = [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 80 },
      { x: 60, y: 80 },
      { x: 60, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    p.parts[0]!.width = 100;
    p.parts[0]!.height = 100;
    expect(nest(p).placements).toHaveLength(0);
  });

  it('handles a reversed concave board identically', () => {
    const p = sampleProject();
    const first = nest(p);
    p.board.reverse();
    expect(nest(p).placements).toEqual(first.placements);
  });
});

describe('bounded nesting', () => {
  it('places the sample deterministically without mutating its input', () => {
    const p = sampleProject();
    const before = JSON.stringify(p);
    const result = nest(p);
    expect(result.placements.length).toBeGreaterThan(3);
    expect(nest(p)).toEqual(result);
    expect(JSON.stringify(p)).toBe(before);
    expect(result.utilization).toBeCloseTo(result.partArea / result.boardArea);
    expect(result.utilization).toBeGreaterThan(0);
    expect(result.utilization).toBeLessThanOrEqual(1);
  });

  it('reserves the full kerf at every board edge and between parts', () => {
    const p = rectangle(50, 30);
    p.kerf = 3;
    p.parts[0]!.quantity = 2;
    const { placements } = nest(p);
    expect(placements).toHaveLength(2);
    for (const r of placements) {
      expect(r.x).toBeGreaterThanOrEqual(3);
      expect(r.y).toBeGreaterThanOrEqual(3);
      expect(r.x + r.width).toBeLessThanOrEqual(47);
      expect(r.y + r.height).toBeLessThanOrEqual(27);
    }
    const [a, b] = placements;
    expect(Math.max(b!.x - a!.x - a!.width, a!.x - b!.x - b!.width)).toBeGreaterThanOrEqual(3);
  });

  it('detects a defect entirely enclosed by a proposed part', () => {
    const p = rectangle(20, 20);
    p.defects = [
      [
        { x: 8, y: 8 },
        { x: 12, y: 8 },
        { x: 12, y: 12 },
        { x: 8, y: 12 },
      ],
    ];
    expect(nest(p).placements).toHaveLength(0);
  });

  it('keeps clearance away from a defect and still finds another valid location', () => {
    const p = rectangle(80, 40);
    p.kerf = 2;
    p.defects = [
      [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 40 },
        { x: 0, y: 40 },
      ],
    ];
    const r = nest(p).placements[0]!;
    expect(r.x).toBeGreaterThanOrEqual(32);
  });

  it('rotates only when permitted', () => {
    const p = rectangle(25, 45);
    p.parts[0]!.width = 40;
    p.parts[0]!.height = 20;
    expect(nest(p).placements).toHaveLength(0);
    p.parts[0]!.canRotate = true;
    expect(nest(p).placements[0]).toMatchObject({ width: 20, height: 40, rotated: true });
  });

  it('reports all impossible copies rather than silently dropping them', () => {
    const p = rectangle(10, 10);
    p.parts[0]!.quantity = 4;
    expect(nest(p).unplaced).toEqual([{ partId: 'part', name: 'Part', count: 4 }]);
  });

  it('requires calibration before working in millimetres', () => {
    const p = rectangle(100, 100);
    p.calibrated = false;
    expect(() => nest(p)).toThrow(/Calibrate/);
  });
});

describe('project imports', () => {
  it('copies supported fields and discards unknown metadata', () => {
    const p = { ...sampleProject(), token: 'do not retain' };
    const clean = validateProject(p);
    expect(clean).not.toHaveProperty('token');
    expect(clean.board).not.toBe(p.board);
  });

  it.each([
    ['unsupported version', (p: Project) => ({ ...p, version: 2 })],
    [
      'non-finite coordinate',
      (p: Project) => ({ ...p, board: [{ x: Infinity, y: 0 }, ...p.board.slice(1)] }),
    ],
    ['negative width', (p: Project) => ({ ...p, parts: [{ ...p.parts[0], width: -5 }] })],
    ['fractional quantity', (p: Project) => ({ ...p, parts: [{ ...p.parts[0], quantity: 1.5 }] })],
    ['duplicate id', (p: Project) => ({ ...p, parts: [p.parts[0], p.parts[0]] })],
    [
      'excessive piece count',
      (p: Project) => ({
        ...p,
        parts: Array.from({ length: 4 }, (_, i) => ({ ...p.parts[0], id: `p${i}`, quantity: 40 })),
      }),
    ],
    [
      'self-intersection',
      (p: Project) => ({
        ...p,
        board: [
          { x: 0, y: 0 },
          { x: 50, y: 50 },
          { x: 0, y: 50 },
          { x: 50, y: 0 },
        ],
      }),
    ],
    ['zero step', (p: Project) => ({ ...p, step: 0 })],
  ])('rejects %s', (_label, change) =>
    expect(() => validateProject(change(sampleProject()))).toThrow(),
  );

  it('rejects SVG and network URLs disguised as image state', () => {
    for (const dataUrl of [
      'data:image/svg+xml;base64,PHN2Zy8+',
      'https://example.com/track.png',
      'data:image/png;base64,PHNjcmlwdD4=',
    ]) {
      expect(() =>
        validateProject({ ...sampleProject(), image: { width: 600, height: 400, dataUrl } }),
      ).toThrow();
    }
  });

  it('accepts an actual embedded PNG signature', () => {
    const p = validateProject({
      ...sampleProject(),
      image: { width: 600, height: 400, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
    });
    expect(p.image?.width).toBe(600);
  });

  it('applies the 8 MiB limit to decoded bytes as well as the data URL', () => {
    const prefix = 'iVBORw0KGgoAAAANSUhEUgAA';
    const encodedLength = 4 * Math.ceil((8 * 1024 * 1024 + 1) / 3);
    const dataUrl = `data:image/png;base64,${prefix}${'A'.repeat(encodedLength - prefix.length)}`;
    expect(dataUrl.length).toBeLessThan(12 * 1024 * 1024);
    expect(() =>
      validateProject({ ...sampleProject(), image: { width: 600, height: 400, dataUrl } }),
    ).toThrow(/8 MiB/);
  });
});

describe('safe physical exports', () => {
  it('sets real millimetre SVG dimensions and escapes labels', () => {
    const p = rectangle(50, 30);
    p.name = '<script>alert(1)</script>';
    p.parts[0]!.name = 'A & <B>';
    const svg = exportSvg(p, nest(p));
    expect(svg).toContain('width="50mm" height="30mm"');
    expect(svg).toContain('viewBox="0 0 50 30"');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('A &amp; &lt;B&gt;');
    expect(svg).not.toContain('<script>');
  });

  it('tiles at exactly 190 × 267 mm with a physical 100 mm scale mark', () => {
    const p = rectangle(400, 300);
    const html = exportPrintHtml(p, nest(p));
    expect(html.match(/class="sheet"/g)).toHaveLength(6);
    expect(html).toContain('@page{size:A4 portrait;margin:10mm}');
    expect(html).toContain('width="190mm" height="267mm" viewBox="190 267 190 267"');
    expect(html).toContain('This line must measure 100 mm');
    expect(html).toContain('window.print()');
    expect(html).toContain('column 3/3, row 2/2');
  });

  it('rejects stale layouts after a dimension change', () => {
    const p = rectangle(100, 100);
    const result = nest(p);
    p.parts[0]!.width = 30;
    expect(() => exportSvg(p, result)).toThrow(/layout/i);
  });

  it('rejects a forged overlapping layout rather than exporting an unsafe plan', () => {
    const p = rectangle(100, 100);
    p.parts[0]!.quantity = 2;
    const result = nest(p);
    result.placements[1] = { ...result.placements[0]! };
    expect(() => exportSvg(p, result)).toThrow(/layout/i);
  });

  it('does not leak the source photograph in an exported plan', () => {
    const p = validateProject({
      ...sampleProject(),
      image: { width: 600, height: 400, dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' },
    });
    expect(exportSvg(p, nest(p))).not.toContain('data:image');
    expect(exportPrintHtml(p, nest(p))).not.toContain('data:image');
  });

  it('bounds pathological print jobs', () => {
    const p = rectangle(20_000, 20_000);
    expect(() => exportPrintHtml(p, nest(p))).toThrow(/200 A4 pages/);
  });
});
