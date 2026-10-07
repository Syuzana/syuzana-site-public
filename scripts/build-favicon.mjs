// Generates the site favicon: a Lorenz attractor in the design-system palette.
// Run `npm run favicon:build` after changing anything here; outputs go to public/.
// Tweak without editing: FAVICON_TRANSIENT, FAVICON_STEPS, FAVICON_STROKE (see the defaults below);
// FAVICON_PREVIEW_DIR=<dir> also writes 16/32/64/256 px previews there.
//
//   public/favicon.svg          vector, used by modern browsers
//   public/favicon.ico          16 + 32 px PNG-in-ICO fallback
//   public/apple-touch-icon.png 180 px, iOS home screen
//   public/icon-512.png         512 px, for manifests / previews

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const OUT = path.resolve("public");
const SIZE = 64; // viewBox units

// Design tokens (public/styles.css).
const INK = "#1e1a19";
const CRIMSON = "#be1e2d";
const PURPLE = "#6e5a86";

// --- Lorenz system ------------------------------------------------------
const SIGMA = 10;
const RHO = 28;
const BETA = 8 / 3;
const DT = 0.004;
const env = (k, d) => (process.env[k] ? Number(process.env[k]) : d);
const TRANSIENT = env("FAVICON_TRANSIENT", 9000); // steps dropped so the orbit sits on the attractor
const STEPS = env("FAVICON_STEPS", 3000); // steps kept: a few loops around each wing

function integrate() {
  let [x, y, z] = [1, 1, 1];
  const pts = [];
  for (let i = 0; i < TRANSIENT + STEPS; i++) {
    // RK4 keeps the loops smooth at this step size.
    const f = ([x, y, z]) => [SIGMA * (y - x), x * (RHO - z) - y, x * y - BETA * z];
    const k1 = f([x, y, z]);
    const k2 = f([x + (DT / 2) * k1[0], y + (DT / 2) * k1[1], z + (DT / 2) * k1[2]]);
    const k3 = f([x + (DT / 2) * k2[0], y + (DT / 2) * k2[1], z + (DT / 2) * k2[2]]);
    const k4 = f([x + DT * k3[0], y + DT * k3[1], z + DT * k3[2]]);
    x += (DT / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (DT / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    z += (DT / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    if (i >= TRANSIENT) pts.push([x, y, z]);
  }
  return pts;
}

// Project onto the x–z plane (the classic butterfly) and fit into the box.
function project(pts) {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[2]);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minZ, maxZ] = [Math.min(...zs), Math.max(...zs)];
  const margin = 7;
  const scale = Math.min((SIZE - 2 * margin) / (maxX - minX), (SIZE - 2 * margin) / (maxZ - minZ));
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return pts.map(([x, , z]) => ({
    x: SIZE / 2 + (x - cx) * scale,
    y: SIZE / 2 - (z - cz) * scale, // SVG y grows downward
    wing: x < 0 ? "left" : "right",
  }));
}

// One polyline per run of points on the same wing, so each wing keeps its colour.
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

function svg(points) {
  const colour = { left: PURPLE, right: CRIMSON };
  const paths = wingRuns(points)
    .map((r) => {
      const d = r.pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("");
      return `<path d="${d}" stroke="${colour[r.wing]}"/>`;
    })
    .join("\n    ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  <title>syuzana.com — Lorenz attractor</title>
  <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.22}" fill="${INK}"/>
  <g fill="none" stroke-width="${env("FAVICON_STROKE", 1.2)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.92">
    ${paths}
  </g>
</svg>
`;
}

// ICO container holding PNG entries (every current browser accepts PNG-in-ICO).
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
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
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

const svgText = svg(project(integrate()));
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "favicon.svg"), svgText);
await writeFile(path.join(OUT, "apple-touch-icon.png"), await png(svgText, 180));
await writeFile(path.join(OUT, "icon-512.png"), await png(svgText, 512));
await writeFile(
  path.join(OUT, "favicon.ico"),
  ico([
    { size: 16, buf: await png(svgText, 16) },
    { size: 32, buf: await png(svgText, 32) },
  ]),
);

// Previews for eyeballing at tab size (scratch only, not committed).
if (process.env.FAVICON_PREVIEW_DIR) {
  const dir = process.env.FAVICON_PREVIEW_DIR;
  await mkdir(dir, { recursive: true });
  for (const s of [16, 32, 64, 256]) await writeFile(path.join(dir, `preview-${s}.png`), await png(svgText, s));
}
console.log("favicon written to public/");
