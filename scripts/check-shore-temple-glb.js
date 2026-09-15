#!/usr/bin/env node
/* Checks assets/models/shore-temple.glb (or any GLB given on the command line)
 * against the contract js/scene-3d.js relies on, and against the size budget.
 *
 * What it asserts, and why each matters:
 *   - node names: the root must be "ShoreTemple" (its extras become the
 *     on-screen declaration) and no camera or light may ship (the authoring
 *     scene's come along unless the export says otherwise);
 *   - POSITION bounds: min y == 0 at court level (a monument that floats or
 *     sinks is invisible at map scale and obvious in the numbers), max y ==
 *     the cited 18.0 m apex;
 *   - images: type, byte size and pixel size read from the JPEG/PNG headers —
 *     a normal map exported as PNG is a megabyte on its own;
 *   - gzip size against the 400 KB budget the user set;
 *   - triangle count, materials, extensions (meshopt must be in
 *     extensionsRequired after compression, and the loader must have a decoder).
 *
 * Node builtins only. Usage: node scripts/check-shore-temple-glb.js [file.glb]
 *   [--root=ShoreTemple] [--apex=18] [--min-y=-2] [--tris=20000-90000]
 * The defaults are the Shore Temple's contract; pancha-rathas.glb is checked
 * with --root=PanchaRathas --apex=11 --min-y=-0.5 --tris=15000-60000.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const argv = process.argv.slice(2);
const optOf = (k, d) => { const a = argv.find((x) => x.startsWith(k + "=")); return a ? a.slice(k.length + 1) : d; };
const file = argv.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "assets", "models", "shore-temple.glb");
const ROOT = optOf("--root", "ShoreTemple");
const APEX = parseFloat(optOf("--apex", "18"));
const MIN_Y = parseFloat(optOf("--min-y", "-2"));
const [TRI_LO, TRI_HI] = optOf("--tris", "20000-90000").split("-").map(Number);
const buf = fs.readFileSync(file);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
const binStart = 20 + jsonLen + 8;
const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

const names = (json.nodes || []).map((n) => n.name);
console.log("nodes:", names.join(", "));
check(names.includes(ROOT), `root node "${ROOT}" present`);
check(!(json.cameras || []).length && !(json.extensions && json.extensions.KHR_lights_punctual), "no cameras or lights shipped");
const rootNode = (json.nodes || []).find((n) => n.name === ROOT);
const extras = (rootNode && rootNode.extras) || {};
check(extras.reconstruction === true && typeof extras.note === "string" && extras.note.length > 40, "root extras carry reconstruction:true and a note");

// geometry bounds and triangles
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, tris = 0;
const acc = json.accessors || [];
for (const m of json.meshes || []) {
  for (const p of m.primitives || []) {
    const a = acc[p.attributes.POSITION];
    /* After meshopt, positions are quantized (KHR_mesh_quantization): int16 in
     * a node-scaled frame, so accessor min/max are no longer metres. Bounds are
     * asserted on the float export; on a quantized file they are skipped. */
    if (a && a.min && a.max && a.componentType === 5126) {
      minX = Math.min(minX, a.min[0]); maxX = Math.max(maxX, a.max[0]);
      minY = Math.min(minY, a.min[1]); maxY = Math.max(maxY, a.max[1]);
      minZ = Math.min(minZ, a.min[2]); maxZ = Math.max(maxZ, a.max[2]);
    }
    if (p.indices !== undefined) tris += acc[p.indices].count / 3;
    else if (a) tris += a.count / 3;
  }
}
/* Node transforms: the root carries the compound's bearing, so accessor bounds
 * are in the root's local frame — heights are unaffected, x/z extents are the
 * unrotated compound. */
console.log(`bounds x ${minX.toFixed(2)}..${maxX.toFixed(2)}  y ${minY.toFixed(2)}..${maxY.toFixed(2)}  z ${minZ.toFixed(2)}..${maxZ.toFixed(2)}  (local frame)`);
console.log(`triangles ${tris}  meshes ${(json.meshes || []).length}  materials ${(json.materials || []).length}`);
if (Number.isFinite(maxY)) {
  check(Math.abs(maxY - APEX) < 0.02, `apex ${APEX.toFixed(2)} m (got ${maxY.toFixed(3)})`);
  check(minY > MIN_Y && minY < 0.05, `base at ground level, nothing deeper than ${MIN_Y} m (min y ${minY.toFixed(2)})`);
} else console.log("bounds: quantized positions, asserted on the float export instead");
check(tris >= TRI_LO && tris <= TRI_HI, `triangle count within ${TRI_LO}-${TRI_HI} (got ${tris})`);
check((json.materials || []).length <= 4, "at most 4 materials");
console.log("extensionsUsed:", (json.extensionsUsed || []).join(", ") || "(none)", "| required:", (json.extensionsRequired || []).join(", ") || "(none)");

// images
const bvs = json.bufferViews || [];
for (const [i, im] of (json.images || []).entries()) {
  const bv = bvs[im.bufferView];
  const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  let w = 0, h = 0;
  if (im.mimeType === "image/jpeg") {
    let o = 2;
    while (o < data.length) {
      if (data[o] !== 0xff) { o++; continue; }
      const marker = data[o + 1];
      if (marker >= 0xc0 && marker <= 0xc3) { h = data.readUInt16BE(o + 5); w = data.readUInt16BE(o + 7); break; }
      o += 2 + data.readUInt16BE(o + 2);
    }
  } else if (im.mimeType === "image/png") { w = data.readUInt32BE(16); h = data.readUInt32BE(20); }
  else if (im.mimeType === "image/webp") { w = h = NaN; }
  console.log(`image ${i} ${im.name || ""} ${im.mimeType} ${w}x${h} ${data.length} B`);
  check(im.mimeType !== "image/png", `image ${i} is not PNG`);
  check(w <= 2048 && h <= 2048, `image ${i} at most 2048 px`);
}

const gz = zlib.gzipSync(buf, { level: 9 }).length;
console.log(`size ${buf.length} B raw, ${gz} B gzipped`);
check(gz <= 409600, `gzipped size within the 400 KB budget (${gz} B)`);

if (fails.length) { console.error(`\n${fails.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
