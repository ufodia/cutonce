import './style.css';
import {
  sampleProject,
  validateProject,
  nest,
  exportSvg,
  exportPrintHtml,
  type Point,
  type Part,
  type Project,
  type NestResult,
} from './core';

type Mode = 'inspect' | 'outline' | 'defect' | 'calibrate';
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('CutOnce could not find its application root.');
let project: Project = sampleProject();
let result: NestResult | null = null;
let mode: Mode = 'inspect';
let draft: Point[] = [];
let referenceMm = 100;
let status = 'A sample offcut is ready. Find a layout, or bring your own material.';
let statusKind: 'info' | 'success' | 'error' = 'info';
let running = false;
let changed = false;
const colors = ['#d9f58b', '#b8d9cf', '#f1bb8b', '#ccbee4', '#d9cf92', '#9ac6d1'];

function escape(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function number(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—';
}
function path(points: Point[]): string {
  return points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}
function setStatus(message: string, kind: typeof statusKind = 'info'): void {
  status = message;
  statusKind = kind;
}
function bounds(): { x: number; y: number; width: number; height: number } {
  const points = [
    ...project.board,
    ...(project.image
      ? [
          { x: 0, y: 0 },
          { x: project.image.width, y: project.image.height },
        ]
      : []),
  ];
  const minX = Math.min(0, ...points.map((p) => p.x));
  const minY = Math.min(0, ...points.map((p) => p.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, ...points.map((p) => p.x)) - minX,
    height: Math.max(1, ...points.map((p) => p.y)) - minY,
  };
}
function invalidate(message = 'Material changed. Find a new layout before exporting.'): void {
  result = null;
  changed = true;
  setStatus(message);
}
function download(content: string, name: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function slug(): string {
  return (
    project.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cutonce-project'
  );
}
function partColor(id: string): string {
  return colors[
    Math.max(
      0,
      project.parts.findIndex((p) => p.id === id),
    ) % colors.length
  ]!;
}
function icon(name: string): string {
  const paths: Record<string, string> = {
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
    cross: '<path d="m6 6 12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    measure: '<path d="m4 16 12-12 4 4L8 20l-4-4Zm4-4 2 2m1-5 2 2m1-5 2 2"/>',
    outline:
      '<path d="m4 4 13 1 3 11-8 4-8-5V4Z"/><path d="M4 4h.01M17 5h.01M20 16h.01M12 20h.01M4 15h.01" stroke-width="4"/>',
    defect: '<path d="m12 3 9 17H3L12 3Zm0 6v5m0 3h.01"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    print: '<path d="M7 8V3h10v5M7 17H3V8h18v9h-4M7 14h10v7H7v-7Zm10-3h.01"/>',
    coffee:
      '<path d="M4 7h13v8a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V7Zm13 1h2a3 3 0 0 1 0 6h-2M7 2v2m4-2v2m4-2v2"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    undo: '<path d="M8 4 3 9l5 5M3 9h11a6 6 0 0 1 0 12"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

function drawing(): string {
  const b = bounds();
  const pad = Math.max(b.width, b.height) * 0.075;
  const font = Math.max(b.width, b.height) * 0.021;
  const grid = Math.max(10, Math.pow(10, Math.floor(Math.log10(Math.max(b.width, b.height))) - 1));
  const placements =
    result?.placements
      .map(
        (p) =>
          `<g class="placed-part"><rect data-placement="${escape(p.partId)}" x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${font * 0.13}" fill="${partColor(p.partId)}" stroke="#194c3d" stroke-width="${font * 0.085}"/><text x="${p.x + p.width / 2}" y="${p.y + p.height / 2 - font * 0.08}" text-anchor="middle" font-size="${Math.min(font, p.width / Math.max(p.name.length * 0.6, 4))}" fill="#133e32" font-weight="700">${escape(p.name)}</text><text x="${p.x + p.width / 2}" y="${p.y + p.height / 2 + font * 1.15}" text-anchor="middle" font-size="${Math.min(font * 0.72, p.width / 8)}" fill="#325246">${number(p.width)} × ${number(p.height)}${p.rotated ? ' ↻' : ''}</text></g>`,
      )
      .join('') || '';
  const circles = draft
    .map(
      (p, i) =>
        `<circle cx="${p.x}" cy="${p.y}" r="${font * 0.3}" fill="#f4f2e8" stroke="#b94327" stroke-width="${font * 0.12}"/><text x="${p.x + font * 0.5}" y="${p.y - font * 0.4}" font-size="${font * 0.8}" fill="#8f301b">${i + 1}</text>`,
    )
    .join('');
  const draftLine = draft.length
    ? `<polyline points="${path(draft)}" fill="${mode === 'calibrate' ? 'none' : '#c4522920'}" stroke="#b94327" stroke-width="${font * 0.15}" stroke-dasharray="${font * 0.4} ${font * 0.3}"/>${circles}`
    : '';
  return `<svg id="material-canvas" data-testid="material-stage" class="material-canvas mode-${mode}" viewBox="${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}" role="img" tabindex="0" aria-label="Material layout canvas" aria-describedby="canvas-help">
    <defs><pattern id="draft-grid" width="${grid}" height="${grid}" patternUnits="userSpaceOnUse"><path d="M${grid} 0H0V${grid}" fill="none" stroke="#264b3920" stroke-width="${font * 0.035}"/></pattern><pattern id="grain" width="${grid * 3}" height="${grid * 3}" patternUnits="userSpaceOnUse"><path d="M0 ${grid * 0.4}Q${grid} ${grid * 0.1} ${grid * 3} ${grid * 0.6}M0 ${grid * 1.5}Q${grid * 2} ${grid} ${grid * 3} ${grid * 1.8}M0 ${grid * 2.7}Q${grid * 1.5} ${grid * 2.2} ${grid * 3} ${grid * 2.9}" fill="none" stroke="#86623b35" stroke-width="${font * 0.06}"/></pattern><pattern id="defect-hatch" width="${font * 0.7}" height="${font * 0.7}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" x2="0" y1="0" y2="${font * 0.7}" stroke="#b94327" stroke-width="${font * 0.12}"/></pattern><clipPath id="board-clip"><polygon points="${path(project.board)}"/></clipPath></defs>
    <rect x="${b.x - pad}" y="${b.y - pad}" width="${b.width + pad * 2}" height="${b.height + pad * 2}" fill="url(#draft-grid)"/>
    ${project.image ? `<image href="${escape(project.image.dataUrl)}" x="0" y="0" width="${project.image.width}" height="${project.image.height}" opacity=".72"/>` : ''}
    <polygon points="${path(project.board)}" fill="${project.image ? '#f9f4e520' : '#cfac7c'}" stroke="#654c31" stroke-width="${font * 0.13}"/>
    ${!project.image ? `<polygon points="${path(project.board)}" fill="url(#grain)"/>` : ''}
    ${placements}
    ${project.defects.map((p) => `<polygon points="${path(p)}" fill="#fcf1d9" stroke="#b94327" stroke-width="${font * 0.12}"/><polygon points="${path(p)}" fill="url(#defect-hatch)"/>`).join('')}
    ${draftLine}
    <path d="M${b.x} ${b.y + b.height + pad * 0.47}h${b.width}m${-b.width} ${-font * 0.3}v${font * 0.6}m${b.width} ${-font * 0.6}v${font * 0.6}" fill="none" stroke="#516458" stroke-width="${font * 0.07}"/>
    <text x="${b.x + b.width / 2}" y="${b.y + b.height + pad * 0.75}" text-anchor="middle" fill="#405849" font-size="${font * 0.75}" font-family="monospace">${number(b.width)} ${project.calibrated ? 'mm' : 'uncalibrated units'}</text>
  </svg>`;
}

function render(): void {
  const b = bounds();
  const total = project.parts.reduce((sum, p) => sum + p.quantity, 0);
  const placed = result?.placements.length || 0;
  const units = project.calibrated ? 'mm' : 'image units';
  const instructions: Record<Mode, string> = {
    inspect: 'Use the tools to trace usable material, mark defects and set a real-world scale.',
    outline:
      'Click around the usable edge. Close it with “Finish outline”. Enter points below to work without a mouse.',
    defect:
      'Click around a knot, hole or damaged area. Finish the exclusion to keep parts clear of it.',
    calibrate:
      'Choose two points with a known real-world distance, enter that distance, then apply the scale.',
  };
  app!.innerHTML = `<header class="site-header"><a class="brand" href="./" aria-label="CutOnce home"><span class="brand-mark" aria-hidden="true"><i></i></span><span>cut<span class="brand-light">once</span><sup>↗</sup></span></a><div class="header-caption">USE WHAT YOU HAVE.<br><span>MAKE SOMETHING GOOD.</span></div><nav class="header-actions" aria-label="Project actions"><button data-action="demo" class="button quiet">Load sample</button><button data-action="open" class="button quiet">${icon('upload')}<span>Open project</span></button><button data-action="save" class="button outline">${icon('save')}<span>Save project</span></button><a class="support-button" href="https://buymeacoffee.com/ufodia" target="_blank" rel="noopener noreferrer" aria-label="Support ufodia on Buy Me a Coffee">${icon('coffee')}<span>Fuel the workshop</span></a></nav></header>
  <main><section class="page-intro"><div><p class="eyebrow"><span class="status-dot"></span> THE OFFCUT WORKSHOP <span class="eyebrow-divider">/</span> V0.1</p><h1>Good material. <span>Second chance.</span></h1><p class="intro-copy">Turn an awkward offcut into your next project. Trace, measure, fit.</p></div><div class="local-badge"><span class="local-icon">⌂</span><div><strong>Your workshop, your files.</strong><span>Works locally · No accounts · No uploads</span></div></div></section>
  <div class="workflow-strip" aria-label="Workflow"><span class="workflow-step ${project.image ? 'complete' : ''}"><b>01</b> Bring your material</span><span class="workflow-line"></span><span class="workflow-step ${project.calibrated ? 'complete' : ''}"><b>02</b> Set the scale</span><span class="workflow-line"></span><span class="workflow-step ${result ? 'complete' : ''}"><b>03</b> Find the fit</span><span class="workflow-line"></span><span class="workflow-step"><b>04</b> Make the cut</span></div>
  <div class="editor-layout"><aside class="sidebar" aria-label="Material and part settings">
    <section class="panel material-panel"><div class="panel-heading"><h2><span class="section-number">01</span> The material</h2><span class="micro-tag">${project.image ? 'PHOTO' : 'DEMO BOARD'}</span></div><label class="field-label" for="project-name">Project name</label><input id="project-name" data-field="project-name" value="${escape(project.name)}" maxlength="80" autocomplete="off"><button class="upload-card" data-action="photo">${icon('upload')}<span><strong>${project.image ? 'Replace material photo' : 'Bring an offcut photo'}</strong><small>PNG, JPEG or WebP · up to 8 MB</small></span><span class="upload-plus">+</span></button><p class="field-hint">Photograph flat, straight above the material. A new photo resets its outline and defects.</p>
    <div class="scale-state ${project.calibrated ? 'is-calibrated' : 'needs-scale'}"><span>${icon(project.calibrated ? 'check' : 'measure')}</span><div><strong>${project.calibrated ? 'Scale set' : 'Scale needed'}</strong><small>${project.calibrated ? `${number(b.width)} × ${number(b.height)} mm extent` : 'Two known points make the plan real.'}</small></div><button class="text-button" data-action="mode" data-mode="calibrate">${project.calibrated ? 'Adjust' : 'Set scale'}</button></div>
    <details class="coordinate-details"><summary>Precise outline coordinates</summary><p class="field-hint">One x,y pair per line, in ${units}. This also provides keyboard-only outline editing.</p><label class="sr-only" for="outline-coordinates">Outline coordinates</label><textarea id="outline-coordinates" rows="5" spellcheck="false">${escape(project.board.map((p) => `${round(p.x)}, ${round(p.y)}`).join('\n'))}</textarea><button data-action="apply-coordinates" class="button outline small">Apply outline</button></details></section>
    <section class="panel parts-panel"><div class="panel-heading"><h2><span class="section-number">02</span> The pieces</h2><span class="count-pill">${total}</span></div><p class="panel-description">What would you like to get out of it?</p><div class="part-column-labels"><span>PIECE / MM</span><span>W</span><span>H</span><span>QTY</span><span></span></div><div class="part-list">${project.parts.map((p, i) => `<div class="part-row" data-part-id="${escape(p.id)}"><label class="part-name-label"><span class="part-swatch" style="--swatch:${colors[i % colors.length]}"></span><input aria-label="Piece ${i + 1} name" data-part-field="name" value="${escape(p.name)}" maxlength="50"></label><input aria-label="${escape(p.name)} width" data-part-field="width" type="number" min="0.1" max="20000" step=".1" value="${p.width}"><input aria-label="${escape(p.name)} height" data-part-field="height" type="number" min="0.1" max="20000" step=".1" value="${p.height}"><input aria-label="${escape(p.name)} quantity" data-part-field="quantity" type="number" min="1" max="40" step="1" value="${p.quantity}"><button class="icon-button remove-part" data-action="remove-part" data-id="${escape(p.id)}" aria-label="Remove ${escape(p.name)}">${icon('cross')}</button><label class="rotate-option"><input type="checkbox" data-part-field="canRotate" ${p.canRotate ? 'checked' : ''}> Allow 90° rotation</label></div>`).join('')}</div><button class="add-piece" data-action="add-part">${icon('plus')} Add a piece</button><div class="settings-grid"><label>Cutting gap <span>mm</span><input id="kerf" data-field="kerf" type="number" min="0" max="50" step=".1" value="${project.kerf}"></label><label>Search grid <span>mm</span><input id="step" data-field="step" type="number" min="0.5" max="100" step=".5" value="${project.step}"></label></div><p class="field-hint">A finer grid explores more positions. The gap reserves space for the cut.</p><button class="button primary find-layout" data-action="nest" aria-label="Find a layout" ${running || !project.calibrated ? 'disabled' : ''}>${running ? '<span class="spinner" aria-hidden="true"></span> Finding the fit…' : `Find a layout ${icon('arrow')}`}</button>${!project.calibrated ? '<p class="uncalibrated-note">Set a real-world scale to unlock layout.</p>' : ''}</section>
  </aside>
  <section class="workspace" aria-label="Cutting plan workspace"><div class="workspace-top"><div><p class="eyebrow">MATERIAL CANVAS</p><h2>${escape(project.name)}</h2></div><span class="canvas-unit">${project.calibrated ? '1 unit = 1 mm' : 'CALIBRATION REQUIRED'}</span></div><div class="canvas-toolbar" role="group" aria-label="Canvas tools">${(['inspect', 'outline', 'defect', 'calibrate'] as Mode[]).map((m) => `<button data-action="mode" data-mode="${m}" class="tool-button ${mode === m ? 'active' : ''}" aria-pressed="${mode === m}" title="${m === 'inspect' ? 'Inspect layout' : m === 'outline' ? 'Draw usable outline' : m === 'defect' ? 'Mark an excluded area' : 'Measure a known distance'}">${icon(m === 'inspect' ? 'eye' : m === 'calibrate' ? 'measure' : m)}<span>${m === 'inspect' ? 'Inspect' : m === 'outline' ? 'Trace outline' : m === 'defect' ? 'Mark defect' : 'Set scale'}</span></button>`).join('')}<span class="toolbar-spacer"></span><button data-action="clear-defects" class="text-button" ${!project.defects.length ? 'disabled' : ''}>Clear defects</button></div>
  <div class="canvas-container"><span class="canvas-corner top-left"></span><span class="canvas-corner top-right"></span>${drawing()}<div class="canvas-legend"><span><i class="legend-dot material-dot"></i> Usable material</span><span><i class="legend-dot defect-dot"></i> Excluded area</span>${result ? '<span><i class="legend-dot piece-dot"></i> Your pieces</span>' : ''}</div><span class="canvas-corner bottom-left"></span><span class="canvas-corner bottom-right"></span></div>
  <div class="drawing-controls"><p id="canvas-help">${instructions[mode]}</p>${mode !== 'inspect' ? `<div class="draw-actions"><span class="point-count">${draft.length} point${draft.length === 1 ? '' : 's'}</span><button class="button quiet small" data-action="undo-point" ${!draft.length ? 'disabled' : ''}>${icon('undo')} Undo point</button>${mode === 'calibrate' ? `<label class="reference-input">Known distance <input aria-label="Known reference distance in millimeters" id="reference-mm" type="number" min=".1" max="20000" step=".1" value="${referenceMm}"> mm</label><button class="button dark small" data-action="apply-scale" ${draft.length !== 2 ? 'disabled' : ''}>Apply scale</button>` : `<button class="button dark small" data-action="finish-polygon" ${draft.length < 3 ? 'disabled' : ''}>Finish ${mode === 'outline' ? 'outline' : 'defect'}</button>`}<button class="text-button" data-action="cancel-drawing">Cancel</button></div><details class="coordinate-entry" open><summary>Enter a point by keyboard</summary><div><label>X <input id="point-x" type="number" step=".1" value="0"></label><label>Y <input id="point-y" type="number" step=".1" value="0"></label><button class="button outline small" data-action="add-point">Add point</button></div></details>` : ''}</div>
  <div class="notice ${statusKind}" role="status" aria-live="polite"><span class="notice-indicator"></span><span>${escape(status)}</span></div>
  <div class="result-strip" data-testid="plan-summary" aria-label="Layout results"><div class="stat stat-utilization"><span class="stat-label">MATERIAL PUT TO WORK</span><strong>${result ? number(result.utilization * 100) : '—'}<small>${result ? '%' : ''}</small></strong><div class="utilization-track"><i style="width:${result ? Math.min(100, result.utilization * 100) : 0}%"></i></div></div><div class="stat"><span class="stat-label">PIECES THAT FIT</span><strong>${result ? placed : '—'}<small> / ${total}</small></strong><span class="stat-caption">${result ? `${result.unplaced.reduce((s, p) => s + p.count, 0)} still to place` : 'Ready when you are'}</span></div><div class="export-actions"><button class="button dark" data-action="print" aria-label="Print at 100%" ${!result ? 'disabled' : ''}>${icon('print')} Print at 100%</button><button class="button outline" data-action="svg" ${!result ? 'disabled' : ''}>${icon('save')} Save SVG</button></div></div>
  ${result?.unplaced.length ? `<div class="unplaced"><strong>Not everything found a home.</strong><p>${result.unplaced.map((p) => `${escape(p.name)} × ${p.count}`).join(' · ')}. Try a finer grid, allow rotation, or use another offcut.</p></div>` : ''}
  <p class="plan-note">A layout is a starting point. Verify scale and material, allow for your tools, and choose a safe cutting order. Photo distortion and grain direction need your judgment.</p></section></div>
  <footer class="site-footer"><span><span class="footer-mark">↗</span> Less waste. More making.</span><span>Open source · MIT © ufodia <a href="https://github.com/ufodia/cutonce" target="_blank" rel="noopener noreferrer">View source ↗</a></span></footer></main>
  <input id="photo-file" aria-label="Upload material photo" type="file" accept="image/png,image/jpeg,image/webp" hidden><input id="project-file" aria-label="Import project" type="file" accept="application/json,.json" hidden>`;
  bindEvents();
}

function readNumber(id: string): number {
  return Number((document.getElementById(id) as HTMLInputElement | null)?.value);
}
function appendPoint(point: Point): void {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > 20000 ||
    Math.abs(point.y) > 20000
  )
    throw new Error('Use finite point coordinates within ±20,000 units.');
  if (mode === 'calibrate' && draft.length >= 2) draft = [];
  if (draft.length >= 64) throw new Error('An outline can contain at most 64 points.');
  draft.push({ x: round(point.x), y: round(point.y) });
  setStatus(
    mode === 'calibrate' && draft.length === 2
      ? 'Two points selected. Enter their known distance and apply the scale.'
      : `${draft.length} point${draft.length === 1 ? '' : 's'} marked.`,
  );
  render();
}
function setMode(next: Mode): void {
  mode = next;
  draft = [];
  setStatus(
    next === 'inspect'
      ? 'Inspect your material and layout.'
      : next === 'calibrate'
        ? 'Choose two points whose real-world distance you know.'
        : `Mark the ${next === 'outline' ? 'usable outline' : 'excluded area'}, then finish it.`,
  );
  render();
}
function checkedProject(value: Project): Project {
  return validateProject(value);
}
async function findLayout(): Promise<void> {
  running = true;
  result = null;
  setStatus('Exploring the offcut. Larger pieces go first.');
  render();
  await new Promise((resolve) => window.setTimeout(resolve, 30));
  try {
    project = checkedProject(project);
    if (!project.calibrated) throw new Error('Calibrate your material before finding a layout.');
    result = nest(project);
    mode = 'inspect';
    draft = [];
    const fit = result.placements.length;
    setStatus(
      fit
        ? `${fit} piece${fit === 1 ? '' : 's'} found a home. Review the plan before cutting.`
        : 'No pieces fit this material. Check the dimensions, excluded areas, gap or search grid.',
      fit ? 'success' : 'info',
    );
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Could not calculate a layout.', 'error');
  } finally {
    running = false;
    render();
  }
}
function parseCoordinates(value: string): Point[] {
  return value
    .trim()
    .split(/[;\n]+/)
    .filter(Boolean)
    .map((line) => {
      const values = line.trim().split(/[ ,]+/).map(Number);
      if (values.length !== 2 || values.some((n) => !Number.isFinite(n)))
        throw new Error('Enter each outline point as x, y on its own line.');
      return { x: values[0]!, y: values[1]! };
    });
}
async function fileText(file: File): Promise<string> {
  if (file.size > 13 * 1024 * 1024) throw new Error('Project files must be smaller than 13 MB.');
  return file.text();
}
async function importPhoto(file: File): Promise<void> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw new Error('Choose a PNG, JPEG or WebP photo.');
  if (file.size > 8 * 1024 * 1024)
    throw new Error('Keep photos below 8 MB. Resize a copy and try again.');
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The photo could not be read.'));
    reader.readAsDataURL(file);
  });
  const image = new Image();
  image.src = dataUrl;
  try {
    await image.decode();
  } catch {
    throw new Error('That photo could not be decoded. Try another raster image.');
  }
  const width = image.naturalWidth,
    height = image.naturalHeight;
  if (width > 12000 || height > 12000 || width * height > 40000000 || !width || !height)
    throw new Error('Use a photo up to 12,000 pixels per side and 40 megapixels.');
  project = checkedProject({
    ...project,
    image: { dataUrl, width, height },
    board: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
    defects: [],
    calibrated: false,
  });
  invalidate('Photo loaded. Trace the usable outline and calibrate a known distance.');
  mode = 'calibrate';
  draft = [];
}

function bindEvents(): void {
  app!.onclick = (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    void (async () => {
      try {
        if (action === 'mode') {
          setMode(button.dataset.mode as Mode);
          return;
        }
        if (action === 'demo') {
          if (
            changed &&
            !window.confirm(
              'Replace this unsaved project with the demo? Save a project file first if you want to keep it.',
            )
          )
            return;
          project = sampleProject();
          result = null;
          mode = 'inspect';
          draft = [];
          changed = false;
          await findLayout();
          return;
        }
        if (action === 'photo') {
          document.getElementById('photo-file')!.click();
          return;
        }
        if (action === 'open') {
          document.getElementById('project-file')!.click();
          return;
        }
        if (action === 'save') {
          const checked = checkedProject(project);
          download(JSON.stringify(checked, null, 2), `${slug()}.cutonce.json`, 'application/json');
          changed = false;
          setStatus(
            'Project downloaded. Keep this file to reopen your material and piece list.',
            'success',
          );
        }
        if (action === 'add-part') {
          if (project.parts.length >= 24)
            throw new Error('Use at most 24 piece types in one project.');
          if (project.parts.reduce((sum, part) => sum + part.quantity, 0) >= 120)
            throw new Error('Use at most 120 requested pieces.');
          project.parts.push({
            id: crypto.randomUUID(),
            name: `Piece ${project.parts.length + 1}`,
            width: 100,
            height: 80,
            quantity: 1,
            canRotate: true,
          });
          invalidate();
        }
        if (action === 'remove-part') {
          project.parts = project.parts.filter((p) => p.id !== button.dataset.id);
          invalidate();
        }
        if (action === 'clear-defects') {
          project.defects = [];
          invalidate('Excluded areas cleared. Find a new layout.');
        }
        if (action === 'nest') {
          await findLayout();
          return;
        }
        if (action === 'undo-point') {
          draft.pop();
          setStatus('Last point removed.');
        }
        if (action === 'cancel-drawing') {
          setMode('inspect');
          return;
        }
        if (action === 'add-point') {
          appendPoint({ x: readNumber('point-x'), y: readNumber('point-y') });
          return;
        }
        if (action === 'finish-polygon') {
          if (mode === 'outline') project = checkedProject({ ...project, board: [...draft] });
          else if (mode === 'defect')
            project = checkedProject({ ...project, defects: [...project.defects, [...draft]] });
          invalidate(
            `${mode === 'outline' ? 'Usable outline' : 'Excluded area'} saved. Find a new layout.`,
          );
          mode = 'inspect';
          draft = [];
        }
        if (action === 'apply-coordinates') {
          const coordinates = (
            document.getElementById('outline-coordinates') as HTMLTextAreaElement
          ).value;
          project = checkedProject({ ...project, board: parseCoordinates(coordinates) });
          invalidate('Precise outline saved. Find a new layout.');
          mode = 'inspect';
          draft = [];
        }
        if (action === 'apply-scale') {
          referenceMm = readNumber('reference-mm');
          if (!(referenceMm >= 0.1 && referenceMm <= 20000) || draft.length !== 2)
            throw new Error('Choose two points and enter a known distance from 0.1 to 20,000 mm.');
          const distance = Math.hypot(draft[1]!.x - draft[0]!.x, draft[1]!.y - draft[0]!.y);
          if (distance < 0.01) throw new Error('The two calibration points must be different.');
          const ratio = referenceMm / distance;
          const scale = (p: Point): Point => ({ x: p.x * ratio, y: p.y * ratio });
          project = checkedProject({
            ...project,
            board: project.board.map(scale),
            defects: project.defects.map((p) => p.map(scale)),
            ...(project.image
              ? {
                  image: {
                    ...project.image,
                    width: project.image.width * ratio,
                    height: project.image.height * ratio,
                  },
                }
              : {}),
            calibrated: true,
          });
          invalidate(
            'Scale applied in millimeters. Your piece dimensions are unchanged. Find a new layout.',
          );
          mode = 'inspect';
          draft = [];
        }
        if (action === 'svg' && result) {
          download(exportSvg(project, result), `${slug()}-layout.svg`, 'image/svg+xml');
          setStatus('SVG downloaded at real-world millimeter dimensions.', 'success');
        }
        if (action === 'print' && result) {
          const html = exportPrintHtml(project, result);
          const printWindow = window.open('', '_blank', 'width=1000,height=800');
          if (!printWindow)
            throw new Error('Allow pop-up windows to open the full-scale print sheets.');
          printWindow.opener = null;
          printWindow.document.open();
          printWindow.document.write(html);
          printWindow.document.close();
          setStatus(
            'Print sheets opened. Use 100% / actual size, then verify the 100 mm ruler.',
            'success',
          );
        }
        render();
      } catch (error) {
        setStatus(
          error instanceof Error ? error.message : 'Something could not be completed.',
          'error',
        );
        render();
      }
    })();
  };
  app!.onchange = (event) => {
    const input = event.target as HTMLInputElement;
    try {
      const field = input.dataset.field;
      if (field === 'project-name') {
        project.name = input.value.trim() || 'Untitled offcut';
        invalidate('Project renamed. Find a new layout to refresh its exports.');
      } else if (field === 'kerf' || field === 'step') {
        const value = Number(input.value);
        if (
          !Number.isFinite(value) ||
          value < (field === 'kerf' ? 0 : 0.5) ||
          value > (field === 'kerf' ? 50 : 100)
        )
          throw new Error(
            `${field === 'kerf' ? 'Cutting gap' : 'Search grid'} must be between ${field === 'kerf' ? 0 : 0.5} and ${field === 'kerf' ? 50 : 100} mm.`,
          );
        project[field] = value;
        invalidate();
      } else if (input.dataset.partField) {
        const row = input.closest<HTMLElement>('[data-part-id]');
        const part = project.parts.find((p) => p.id === row?.dataset.partId);
        if (!part) return;
        const partField = input.dataset.partField as keyof Part;
        if (partField === 'name') part.name = input.value.trim() || 'Untitled piece';
        else if (partField === 'canRotate') part.canRotate = input.checked;
        else if (partField === 'width' || partField === 'height' || partField === 'quantity') {
          const value = Number(input.value);
          const maximum = partField === 'quantity' ? 40 : 20000;
          if (
            !Number.isFinite(value) ||
            value < (partField === 'quantity' ? 1 : 0.1) ||
            value > maximum ||
            (partField === 'quantity' && !Number.isInteger(value))
          )
            throw new Error(
              `Use ${partField === 'quantity' ? 'a whole quantity from 1 to 40' : 'a dimension from 0.1 to 20,000 mm'}.`,
            );
          if (
            partField === 'quantity' &&
            project.parts.reduce(
              (sum, other) => sum + (other.id === part.id ? value : other.quantity),
              0,
            ) > 120
          )
            throw new Error('Use at most 120 requested pieces.');
          part[partField] = value;
        }
        invalidate();
      } else if (input.id === 'reference-mm') {
        referenceMm = Number(input.value);
        return;
      } else return;
      render();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Check the entered value.', 'error');
      render();
    }
  };
  document.getElementById('material-canvas')!.addEventListener('click', (event) => {
    if (mode === 'inspect' || running) return;
    try {
      const svg = event.currentTarget as SVGSVGElement;
      const matrix = svg.getScreenCTM();
      if (!matrix) throw new Error('The canvas is not ready. Try again.');
      const point = svg.createSVGPoint();
      point.x = (event as MouseEvent).clientX;
      point.y = (event as MouseEvent).clientY;
      const transformed = point.matrixTransform(matrix.inverse());
      appendPoint(transformed);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not mark that point.', 'error');
      render();
    }
  });
  document.getElementById('photo-file')!.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void importPhoto(file)
      .then(render)
      .catch((error) => {
        setStatus(error instanceof Error ? error.message : 'Could not open the photo.', 'error');
        render();
      });
  });
  document.getElementById('project-file')!.addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void fileText(file)
      .then((text) => {
        const imported = validateProject(JSON.parse(text));
        if (changed && !window.confirm('Replace the unsaved project with this file?')) return;
        project = imported;
        result = null;
        mode = 'inspect';
        draft = [];
        changed = false;
        setStatus('Project opened. Find a layout to recompute its plan.', 'success');
        render();
      })
      .catch((error) => {
        setStatus(
          error instanceof Error ? error.message : 'Could not open that project file.',
          'error',
        );
        render();
      });
  });
}

window.addEventListener('beforeunload', (event) => {
  if (changed) {
    event.preventDefault();
    event.returnValue = '';
  }
});
render();
void findLayout();
