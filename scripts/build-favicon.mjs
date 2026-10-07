// Generates the site favicon: the Lorenz attractor in the design-system palette.
// Run `npm run favicon:build` after changing anything here; outputs go to public/.
//
//   public/favicon.svg          vector, used by modern browsers
//   public/favicon.ico          16 + 32 px PNG-in-ICO fallback
//   public/apple-touch-icon.png 180 px, square corners (iOS rounds it itself)
//   public/icon-512.png         512 px, for manifests and link previews
//
// FAVICON_PREVIEW_DIR=<dir> also writes 16/32/64/256 px previews there.
//
// The parameters below are tuned for 16 px, not for the large render: fewer orbits and a
// thick line keep the butterfly readable in a tab. A cream separation stroke under every
// coloured one stops successive loops from merging into a blot.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("public");
const SIZE = 64; // viewBox units

// Design tokens (public/styles.css).
const PAPER = "#f3eee6";
const CRIMSON = "#be1e2d";
const CRIMSON_DEEP = "#7e1620";

// Mark geometry.
const TRANSIENT = 9000; // steps dropped so the orbit sits on the attractor
const STEPS = 1150; // steps kept
const STROKE = 3.3;
const SEPARATION = 0.9; // extra width of the paper-coloured stroke under each line
const MARGIN = 8;
const RADIUS = 0.22; // badge corner radius, as a fraction of SIZE
const RIM = 1.6; // crimson rim, so the badge keeps an edge on a light browser toolbar

// --- Lorenz system ------------------------------------------------------
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const DT = 0.004;
const derivative = ([x, y, z]) => [SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z];

function integrate() {
  let [x, y, z] = [1, 1, 1];
  const pts = [];
  for (let i = 0; i < TRANSIENT + STEPS; i++) {
    // RK4 keeps the loops smooth at this step size.
    const k1 = derivative([x, y, z]);
    const k2 = derivative([x + (DT / 2) * k1[0], y + (DT / 2) * k1[1], z + (DT / 2) * k1[2]]);
    const k3 = derivative([x + (DT / 2) * k2[0], y + (DT / 2) * k2[1], z + (DT / 2) * k2[2]]);
    const k4 = derivative([x + DT * k3[0], y + DT * k3[1], z + DT * k3[2]]);
    x += (DT / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (DT / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (DT / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i >= TRANSIENT) pts.push([x, y, z]);
  }
  return pts;
}

/** Project onto the x–z plane (the classic butterfly) and fit the box. */
function project(pts) {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[2]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
  const scale = Math.min((SIZE - 2 * MARGIN) / (maxX - minX), (SIZE - 2 * MARGIN) / (maxZ - minZ));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return pts.map(([x, , z]) => ({
    x: SIZE / 2 + (x - cx) * scale,
    y: SIZE / 2 - (z - cz) * scale, // SVG y grows downward
    wing: x < 0 ? "left" : "right",
  }));
}

/** One polyline per run of points on the same wing, so each wing keeps its colour. */
function wingRuns(points) {
  const runs = [];
  let run = null;
  for (const p of points) {
    if (!run || run.wing !== p.wing) {
      run = { wing: p.wing, pts: run ? [run.pts.at(-1)] : [] }; // overlap one point: no gaps
      runs.push(run);
    }
    run.pts.push(p);
  }
  return runs;
}

function svg({ radius = RADIUS } = {}) {
  const colour = { left: CRIMSON_DEEP, right: CRIMSON };
  const body = wingRuns(project(integrate()))
    .map((r) => {
      const d = r.pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");
      return (
        `<path d="${d}" stroke="${PAPER}" stroke-width="${(STROKE + SEPARATION).toFixed(2)}"/>` +
        `<path d="${d}" stroke="${colour[r.wing]}" stroke-width="${STROKE}"/>`
      );
    })
    .join("");
  const rim = radius
    ? `<rect x="${RIM / 2}" y="${RIM / 2}" width="${SIZE - RIM}" height="${SIZE - RIM}" rx="${(SIZE * radius - RIM / 2).toFixed(2)}" fill="none" stroke="${CRIMSON}" stroke-width="${RIM}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <title>syuzana.com — Lorenz attractor</title>
  <rect width="${SIZE}" height="${SIZE}" rx="${(SIZE * radius).toFixed(2)}" fill="${PAPER}"/>
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</g>
  ${rim}
</svg>
`;
}

/** ICO container holding PNG entries (every current browser accepts PNG-in-ICO). */
function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const dir = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    dir.push(e);
  }
  return Buffer.concat([header, ...dir, ...pngs.map((p) => p.buf)]);
}

async function png(svgText, size) {
  return sharp(Buffer.from(svgText), { density: (72 * size) / SIZE })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const rounded = svg();
const squared = svg({ radius: 0 }); // iOS applies its own mask; transparent corners would go black

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "favicon.svg"), rounded);
await writeFile(path.join(OUT, "apple-touch-icon.png"), await png(squared, 180));
await writeFile(path.join(OUT, "icon-512.png"), await png(rounded, 512));
await writeFile(
  path.join(OUT, "favicon.ico"),
  ico([
    { size: 16, buf: await png(rounded, 16) },
    { size: 32, buf: await png(rounded, 32) },
  ]),
);

if (process.env.FAVICON_PREVIEW_DIR) {
  const dir = process.env.FAVICON_PREVIEW_DIR;
  await mkdir(dir, { recursive: true });
  for (const s of [16, 32, 64, 256]) await writeFile(path.join(dir, `preview-${s}.png`), await png(rounded, s));
}
console.log("favicon written to public/");
