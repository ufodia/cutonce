/** CutOnce's geometry and export engine. All model distances are millimetres. */
export interface Point {
  x: number;
  y: number;
}
export interface Part {
  id: string;
  name: string;
  width: number;
  height: number;
  quantity: number;
  canRotate: boolean;
}
export interface Project {
  version: 1;
  name: string;
  board: Point[];
  defects: Point[][];
  parts: Part[];
  kerf: number;
  step: number;
  image?: { dataUrl: string; width: number; height: number };
  calibrated: boolean;
}
export interface Placement {
  partId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
}
export interface NestResult {
  placements: Placement[];
  unplaced: { partId: string; name: string; count: number }[];
  utilization: number;
  boardArea: number;
  partArea: number;
}

const EPS = 1e-7;
const MAX_COORDINATE = 20_000;
const MAX_CANDIDATE_CHECKS = 250_000;
const MAX_GRID_AXIS = 110;
const MAX_PRINT_PAGES = 200;
const COLORS = ['#cbe57b', '#7cc9bd', '#f2bf73', '#c0aedb', '#e9a49a', '#8ebcda'];
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function onSegment(p: Point, a: Point, b: Point): boolean {
  return (
    Math.abs(cross(a, b, p)) <= EPS * Math.max(1, distance(a, b)) &&
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

/** Boundary points count as inside. Simple polygons may be clockwise or counterclockwise. */
export function pointInPolygon(p: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j]!;
    const b = polygon[i]!;
    if (onSegment(p, a, b)) return true;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Unsigned shoelace area, in square model units. */
export function polygonArea(points: Point[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twiceArea) / 2;
}

function segmentsTouch(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
    ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))
  )
    return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  if (denominator < EPS) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denominator));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsTouch(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}

/** A segment can leave a concave polygon even when both its endpoints are inside. */
function segmentInside(a: Point, b: Point, polygon: Point[]): boolean {
  const ts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  for (let i = 0; i < polygon.length; i++) {
    const c = polygon[i]!;
    const d = polygon[(i + 1) % polygon.length]!;
    const ex = d.x - c.x;
    const ey = d.y - c.y;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) > EPS) {
      const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / denominator;
      const u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / denominator;
      if (t > EPS && t < 1 - EPS && u >= -EPS && u <= 1 + EPS) ts.push(t);
    } else if (lengthSquared > EPS && Math.abs(cross(a, b, c)) < EPS) {
      for (const p of [c, d]) {
        const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
        if (t > EPS && t < 1 - EPS) ts.push(t);
      }
    }
  }
  ts.sort((x, y) => x - y);
  for (let i = 1; i < ts.length; i++) {
    const t = (ts[i - 1]! + ts[i]!) / 2;
    if (!pointInPolygon({ x: a.x + dx * t, y: a.y + dy * t }, polygon)) return false;
  }
  return pointInPolygon(a, polygon) && pointInPolygon(b, polygon);
}

function polygonDistance(a: Point[], b: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) {
      min = Math.min(
        min,
        segmentDistance(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!),
      );
      if (min <= EPS) return 0;
    }
  return min;
}

function rectanglesOverlap(a: Placement, b: Placement): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    a.x + a.width > b.x + EPS &&
    a.y < b.y + b.height - EPS &&
    a.y + a.height > b.y + EPS
  );
}

function corners(rect: Pick<Placement, 'x' | 'y' | 'width' | 'height'>): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function bounds(points: Point[]) {
  return {
    minX: Math.min(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxX: Math.max(...points.map((p) => p.x)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

function readPolygon(raw: unknown, label: string): Point[] {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > 64)
    throw new Error(`${label} must contain 3–64 corners.`);
  const polygon = raw.map((p: unknown) => {
    if (!p || typeof p !== 'object') throw new Error(`${label} has an invalid corner.`);
    const { x, y } = p as Record<string, unknown>;
    if (!finite(x) || !finite(y) || Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE)
      throw new Error(`${label} coordinates must be finite and within ±20,000.`);
    return { x, y };
  });
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    if (distance(a, b) < 0.0001) throw new Error(`${label} has duplicate consecutive corners.`);
    for (let j = i + 1; j < polygon.length; j++) {
      if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
      if (segmentsTouch(a, b, polygon[j]!, polygon[(j + 1) % polygon.length]!))
        throw new Error(`${label} crosses or touches itself. Trace a simple outline.`);
    }
  }
  if (polygonArea(polygon) < 1)
    throw new Error(`${label} must have at least 1 square unit of area.`);
  return polygon;
}

function textField(value: unknown, name: string, max = 120): string {
  if (
    typeof value !== 'string' ||
    value.trim().length < 1 ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new Error(`${name} must be 1–${max} readable characters.`);
  return value.trim();
}

/** Validate and copy imported state; unknown fields are intentionally discarded. */
export function validateProject(value: unknown): Project {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Choose a CutOnce project object.');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1)
    throw new Error('This project version is not supported. Expected version 1.');
  const board = readPolygon(raw.board, 'Board');
  if (!Array.isArray(raw.defects) || raw.defects.length > 24)
    throw new Error('Use at most 24 defect outlines.');
  const defects = raw.defects.map((p, i) => readPolygon(p, `Defect ${i + 1}`));
  if (board.length + defects.reduce((n, p) => n + p.length, 0) > 256)
    throw new Error('Use at most 256 outline corners in total.');
  if (!Array.isArray(raw.parts) || raw.parts.length > 24)
    throw new Error('Use at most 24 part types.');
  const ids = new Set<string>();
  const parts: Part[] = raw.parts.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== 'object') throw new Error(`Part ${index + 1} is invalid.`);
    const p = entry as Record<string, unknown>;
    const id = textField(p.id, 'Part id', 64);
    if (!/^[a-zA-Z0-9._-]+$/.test(id) || ids.has(id))
      throw new Error('Part ids must be unique letters, numbers, dots, dashes or underscores.');
    ids.add(id);
    if (
      !finite(p.width) ||
      !finite(p.height) ||
      p.width < 0.1 ||
      p.height < 0.1 ||
      p.width > MAX_COORDINATE ||
      p.height > MAX_COORDINATE
    )
      throw new Error('Part dimensions must be between 0.1 and 20,000 mm.');
    if (!finite(p.quantity) || !Number.isInteger(p.quantity) || p.quantity < 1 || p.quantity > 40)
      throw new Error('Part quantity must be a whole number from 1 to 40.');
    if (typeof p.canRotate !== 'boolean') throw new Error('Part rotation must be true or false.');
    return {
      id,
      name: textField(p.name, 'Part name', 80),
      width: p.width,
      height: p.height,
      quantity: p.quantity,
      canRotate: p.canRotate,
    };
  });
  if (parts.reduce((n, p) => n + p.quantity, 0) > 120)
    throw new Error('Use at most 120 requested pieces.');
  if (!finite(raw.kerf) || raw.kerf < 0 || raw.kerf > 50)
    throw new Error('Cutting clearance must be between 0 and 50 mm.');
  if (!finite(raw.step) || raw.step < 0.5 || raw.step > 100)
    throw new Error('Search step must be between 0.5 and 100 mm.');
  if (typeof raw.calibrated !== 'boolean') throw new Error('Project calibration state is missing.');
  const project: Project = {
    version: 1,
    name: textField(raw.name, 'Project name'),
    board,
    defects,
    parts,
    kerf: raw.kerf,
    step: raw.step,
    calibrated: raw.calibrated,
  };
  if (raw.image !== undefined) {
    if (!raw.image || typeof raw.image !== 'object')
      throw new Error('The project image is invalid.');
    const image = raw.image as Record<string, unknown>;
    if (
      !finite(image.width) ||
      !finite(image.height) ||
      image.width <= 0 ||
      image.height <= 0 ||
      image.width > MAX_COORDINATE ||
      image.height > MAX_COORDINATE
    )
      throw new Error('Image dimensions must be positive and no larger than 20,000.');
    if (
      typeof image.dataUrl !== 'string' ||
      image.dataUrl.length > 12 * 1024 * 1024 ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image.dataUrl)
    )
      throw new Error('Use a PNG, JPEG or WebP image no larger than 8 MiB.');
    const [header, data = ''] = image.dataUrl.split(',');
    if (data.length % 4 !== 0) throw new Error('The embedded image is malformed.');
    const padding = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
    if ((data.length / 4) * 3 - padding > 8 * 1024 * 1024)
      throw new Error('Use a PNG, JPEG or WebP image no larger than 8 MiB.');
    let signature = '';
    try {
      signature = atob(data.slice(0, 32));
    } catch {
      throw new Error('The embedded image is malformed.');
    }
    const valid = header?.includes('/png')
      ? signature.startsWith('\x89PNG\r\n\x1a\n')
      : header?.includes('/jpeg')
        ? signature.startsWith('\xff\xd8\xff')
        : signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP';
    if (!valid)
      throw new Error('The embedded image does not match its declared PNG, JPEG or WebP format.');
    project.image = { dataUrl: image.dataUrl, width: image.width, height: image.height };
  }
  return project;
}

function fits(rect: Placement, project: Project, placed: Placement[]): boolean {
  const rc = corners(rect);
  // Check cheap rectangle relationships before polygon work.
  for (const other of placed) {
    if (rectanglesOverlap(rect, other)) return false;
    const dx = Math.max(other.x - (rect.x + rect.width), rect.x - (other.x + other.width), 0);
    const dy = Math.max(other.y - (rect.y + rect.height), rect.y - (other.y + other.height), 0);
    if (Math.hypot(dx, dy) < project.kerf - EPS) return false;
  }
  if (!rc.every((p) => pointInPolygon(p, project.board))) return false;
  for (let i = 0; i < rc.length; i++)
    if (!segmentInside(rc[i]!, rc[(i + 1) % rc.length]!, project.board)) return false;
  if (project.kerf > 0 && polygonDistance(rc, project.board) < project.kerf - EPS) return false;
  for (const defect of project.defects) {
    // A hole can be entirely enclosed by the rectangle without crossing an edge.
    if (defect.some((p) => pointInPolygon(p, rc)) || rc.some((p) => pointInPolygon(p, defect)))
      return false;
    const gap = polygonDistance(rc, defect);
    if (gap <= EPS || gap < project.kerf - EPS) return false;
  }
  return true;
}

function axisCandidates(
  min: number,
  max: number,
  step: number,
  width: number,
  kerf: number,
  vertices: number[],
  placed: number[],
): number[] {
  const low = min + kerf;
  const high = max - width - kerf;
  if (high < low - EPS) return [];
  const effectiveStep = Math.max(step, (high - low) / (MAX_GRID_AXIS - 1));
  const values = [low, high];
  for (let value = low; value < high - EPS; value += effectiveStep) values.push(value);
  for (const v of vertices) values.push(v + kerf, v - width - kerf);
  values.push(...placed);
  const sorted = values.filter((v) => v >= low - EPS && v <= high + EPS).sort((a, b) => a - b);
  return sorted.filter((v, i) => i === 0 || Math.abs(v - sorted[i - 1]!) > EPS);
}

/**
 * Deterministic largest-first nesting. A bounded grid plus shape/placement edges
 * supplies candidates. This is a feasible-layout heuristic, not an optimum proof.
 */
export function nest(input: Project): NestResult {
  const project = validateProject(input);
  if (!project.calibrated)
    throw new Error('Calibrate the photo before placing millimetre-sized parts.');
  const b = bounds(project.board);
  const placements: Placement[] = [];
  const unplaced: NestResult['unplaced'] = [];
  let remainingChecks = MAX_CANDIDATE_CHECKS;
  const allVertices = [project.board, ...project.defects].flat();
  const ordered = project.parts
    .map((p, index) => ({ ...p, index }))
    .sort((a, z) => z.width * z.height - a.width * a.height || a.index - z.index);
  for (const part of ordered) {
    let missed = 0;
    for (let copy = 0; copy < part.quantity; copy++) {
      let found: Placement | undefined;
      const orientations = [{ width: part.width, height: part.height, rotated: false }];
      if (part.canRotate && Math.abs(part.width - part.height) > EPS)
        orientations.push({ width: part.height, height: part.width, rotated: true });
      for (const orientation of orientations) {
        const xs = axisCandidates(
          b.minX,
          b.maxX,
          project.step,
          orientation.width,
          project.kerf,
          allVertices.map((p) => p.x),
          placements.flatMap((p) => [
            p.x + p.width + project.kerf,
            p.x - orientation.width - project.kerf,
          ]),
        );
        const ys = axisCandidates(
          b.minY,
          b.maxY,
          project.step,
          orientation.height,
          project.kerf,
          allVertices.map((p) => p.y),
          placements.flatMap((p) => [
            p.y + p.height + project.kerf,
            p.y - orientation.height - project.kerf,
          ]),
        );
        for (const y of ys) {
          for (const x of xs) {
            if (remainingChecks-- <= 0) break;
            const candidate = { partId: part.id, name: part.name, x, y, ...orientation };
            if (fits(candidate, project, placements)) {
              found = candidate;
              break;
            }
          }
          if (found || remainingChecks <= 0) break;
        }
        if (found || remainingChecks <= 0) break;
      }
      if (found) placements.push(found);
      else {
        missed = part.quantity - copy;
        break;
      }
    }
    if (missed) unplaced.push({ partId: part.id, name: part.name, count: missed });
  }
  const boardArea = polygonArea(project.board);
  const partArea = placements.reduce((sum, p) => sum + p.width * p.height, 0);
  return {
    placements,
    unplaced,
    boardArea,
    partArea,
    utilization: boardArea ? partArea / boardArea : 0,
  };
}

export function sampleProject(): Project {
  return {
    version: 1,
    name: 'The workshop offcut',
    calibrated: true,
    kerf: 3,
    step: 5,
    board: [
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 270 },
      { x: 440, y: 270 },
      { x: 440, y: 400 },
      { x: 0, y: 400 },
    ],
    defects: [
      [
        { x: 320, y: 150 },
        { x: 390, y: 150 },
        { x: 390, y: 210 },
        { x: 320, y: 210 },
      ],
    ],
    parts: [
      { id: 'shelf', name: 'Shelf', width: 220, height: 120, quantity: 2, canRotate: true },
      { id: 'side', name: 'Side', width: 160, height: 100, quantity: 2, canRotate: true },
      { id: 'brace', name: 'Brace', width: 90, height: 70, quantity: 3, canRotate: true },
    ],
  };
}

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
const num = (value: number): string => Number(value.toFixed(4)).toString();
const pointsAttribute = (points: Point[]): string =>
  points.map((p) => `${num(p.x)},${num(p.y)}`).join(' ');

function drawing(project: Project, result: NestResult): string {
  const shapes = [
    `<polygon points="${pointsAttribute(project.board)}" fill="#f7f3e7" stroke="#253d32" stroke-width="0.6"/>`,
  ];
  project.defects.forEach((p) =>
    shapes.push(
      `<polygon points="${pointsAttribute(p)}" fill="#f5cbc5" stroke="#9a4034" stroke-width="0.7" stroke-dasharray="3 2"/>`,
    ),
  );
  result.placements.forEach((p, i) => {
    const size = Math.max(
      2,
      Math.min(4.5, p.height / 5, p.width / Math.max(5, p.name.length * 0.7)),
    );
    shapes.push(
      `<g><rect x="${num(p.x)}" y="${num(p.y)}" width="${num(p.width)}" height="${num(p.height)}" rx="0.5" fill="${COLORS[project.parts.findIndex((part) => part.id === p.partId) % COLORS.length] ?? COLORS[0]}" stroke="#253d32" stroke-width="0.45"/><text x="${num(p.x + p.width / 2)}" y="${num(p.y + p.height / 2 - size / 2)}" text-anchor="middle" font-family="sans-serif" font-size="${num(size)}" fill="#14291f">${i + 1}. ${escape(p.name)}</text><text x="${num(p.x + p.width / 2)}" y="${num(p.y + p.height / 2 + size)}" text-anchor="middle" font-family="sans-serif" font-size="${num(size * 0.8)}" fill="#14291f">${num(p.width)} × ${num(p.height)} mm${p.rotated ? ' · rotated' : ''}</text></g>`,
    );
  });
  return shapes.join('');
}

function checkedResult(project: Project, result: NestResult): NestResult {
  if (!project.calibrated) throw new Error('Calibrate the photo before exporting a cutting plan.');
  if (!result || !Array.isArray(result.placements) || result.placements.length > 120)
    throw new Error('Create a layout before exporting.');
  const placed: Placement[] = [];
  const counts = new Map<string, number>();
  for (const p of result.placements) {
    const part = project.parts.find((part) => part.id === p.partId);
    if (
      !part ||
      ![p.x, p.y, p.width, p.height].every(finite) ||
      p.name !== part.name ||
      typeof p.rotated !== 'boolean'
    )
      throw new Error('The layout is stale or invalid. Place the parts again.');
    const width = p.rotated ? part.height : part.width;
    const height = p.rotated ? part.width : part.height;
    if (
      (p.rotated && !part.canRotate) ||
      Math.abs(width - p.width) > EPS ||
      Math.abs(height - p.height) > EPS ||
      !fits(p, project, placed)
    )
      throw new Error('The layout no longer matches the project. Place the parts again.');
    counts.set(part.id, (counts.get(part.id) ?? 0) + 1);
    if (counts.get(part.id)! > part.quantity)
      throw new Error('The layout has too many pieces. Place the parts again.');
    placed.push(p);
  }
  return result;
}

/** Vector-only plan. The original photo never becomes part of a cutting export. */
export function exportSvg(input: Project, result: NestResult): string {
  const project = validateProject(input);
  checkedResult(project, result);
  const b = bounds(project.board);
  const width = b.maxX - b.minX;
  const height = b.maxY - b.minY;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" viewBox="${num(b.minX)} ${num(b.minY)} ${num(width)} ${num(height)}" role="img"><title>${escape(project.name)} — CutOnce cutting plan</title><desc>Dimensions are millimetres. Clearance ${num(project.kerf)} mm. Measure the original material and verify scale before cutting. Placement order is not a cutting sequence.</desc>${drawing(project, result)}</svg>`;
}

/** Self-contained 1:1 A4 pages; print at Actual size / 100%, never Fit to page. */
export function exportPrintHtml(input: Project, result: NestResult): string {
  const project = validateProject(input);
  checkedResult(project, result);
  const b = bounds(project.board);
  const tileWidth = 190;
  const tileHeight = 267;
  const columns = Math.max(1, Math.ceil((b.maxX - b.minX) / tileWidth));
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / tileHeight));
  if (columns * rows > MAX_PRINT_PAGES)
    throw new Error(
      'This plan needs more than 200 A4 pages. Export SVG instead or reduce the board size.',
    );
  const art = drawing(project, result);
  const pages: string[] = [];
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const x = b.minX + column * tileWidth;
      const y = b.minY + row * tileHeight;
      pages.push(
        `<article class="sheet"><header>${escape(project.name)} · CutOnce · column ${column + 1}/${columns}, row ${row + 1}/${rows} · origin ${num(x)}, ${num(y)} mm</header><svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="267mm" viewBox="${num(x)} ${num(y)} 190 267" aria-label="Cutting plan tile">${art}<rect x="${num(x + 0.2)}" y="${num(y + 0.2)}" width="189.6" height="266.6" fill="none" stroke="#888" stroke-dasharray="2 2" stroke-width="0.2"/></svg><footer><svg width="108mm" height="5mm" viewBox="0 0 108 5" aria-label="100 millimetre calibration ruler"><path d="M2 0V3M2 1.5H102M102 0V3" fill="none" stroke="black" stroke-width="0.25"/><text x="52" y="4.7" font-size="2.4" text-anchor="middle">This line must measure 100 mm</text></svg><span>100% / Actual size · 10 mm margins</span></footer></article>`,
      );
    }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(project.name)} — CutOnce print plan</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;color:#172e22;background:#e9eee8;font-family:system-ui,sans-serif}.controls{max-width:900px;margin:24px auto;padding:24px;background:white;border-radius:12px}.controls p{line-height:1.5}button{padding:12px 20px;background:#214c36;color:white;border:0;border-radius:8px;font:inherit;cursor:pointer}.sheet{width:190mm;height:277mm;background:white;margin:12px auto;overflow:hidden;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}header{height:5mm;line-height:5mm;overflow:hidden;white-space:nowrap;font-size:2.4mm}.sheet>svg{display:block;width:190mm;height:267mm}footer{height:5mm;display:flex;align-items:center;justify-content:space-between;font-size:2.4mm}footer svg{flex:none}footer span{white-space:nowrap}@media print{body{background:white}.controls{display:none}.sheet{margin:0;box-shadow:none}}</style></head><body><section class="controls"><h1>Your 1:1 cutting plan</h1><p>Choose <strong>A4 portrait, 100% / Actual size, 10 mm margins</strong>. Disable browser headers and footers. Do not use “Fit to page”. Measure the 100 mm ruler on the first sheet before cutting; printer settings can change scale.</p><p>Trim the blank 10 mm margins and join matching column/row tiles at their dashed edges. Red areas are defects. Layout order is not a safe cutting sequence; plan tool access and verify all measurements yourself.</p><button type="button" onclick="window.print()">Print cutting plan</button></section>${pages.join('')}</body></html>`;
}
