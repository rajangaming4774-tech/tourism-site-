#!/usr/bin/env node
/* Re-encodes the images embedded in a GLB as JPEG, and can drop what the
 * scene does not need. This is the size discipline for shore-temple.glb.
 *
 * WHY. The cloud Blender that builds the model commits its export with the
 * exporter's defaults: packed (baked) images come out as PNG — a 1024 px
 * normal map alone is 800 KB, against a 400 KB budget for the whole file —
 * and every vertex carries a normal. JPEG at a sensible quality is a tenth of
 * the PNG and, at 4 cm per texel seen from 40 m and more, indistinguishable.
 * The vertex normals are optional too: the exporter has already split every
 * vertex on every hard edge (the UV seams fall on the same edges), so when the
 * loader recomputes normals from the faces it gets the same flat shading
 * back, and a quarter of the geometry bytes are gone. Run this BEFORE meshopt
 * compression, which leaves images alone anyway.
 *
 * Node builtins + ffmpeg. Usage:
 *   node scripts/repack-glb-images.js in.glb out.glb [--q N] [--q-normal N]
 *        [--scale-normal 0.5] [--scale-color 0.5] [--drop-normals] [--base-color-scale 0.65]
 *   q is ffmpeg's -q:v (2 best .. 31 worst); defaults 5 for colour, 6 for normals.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const flag = (name) => args.includes(name);
const [inFile, outFile] = positional;
if (!inFile || !outFile) { console.error("usage: repack-glb-images.js in.glb out.glb [--q N] [--q-normal N] [--scale-normal f] [--scale-color f] [--drop-normals]"); process.exit(1); }
const qColor = opt("--q", "5"), qNormal = opt("--q-normal", "6");
/* --base-color-scale multiplies every material's baseColorFactor. It is the
 * "one number to turn" from 05-shore-temple-photogrammetry.md: the granite's
 * chromaticity is measured and stays; its brightness is chosen, and in the
 * scene the baked albedo read paler than the sand it stands on, where the
 * photographs show the stone darker than the sand. Recorded in 06-. */
const baseScale = parseFloat(opt("--base-color-scale", "1"));
const scaleNormal = parseFloat(opt("--scale-normal", "1")), scaleColor = parseFloat(opt("--scale-color", "1"));

const buf = fs.readFileSync(inFile);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("not a GLB");
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));
const binLen = buf.readUInt32LE(20 + jsonLen);
const bin = buf.subarray(28 + jsonLen, 28 + jsonLen + binLen);

/* Which images are normal maps: the ones a material's normalTexture points at.
 * Names are not reliable — Blender renames a packed image after its file. */
const normalImages = new Set();
for (const m of json.materials || []) {
  const t = m.normalTexture && json.textures[m.normalTexture.index];
  if (t && t.source !== undefined) normalImages.add(t.source);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "glb-repack-"));
const replaced = new Map();   // bufferView index -> Buffer (jpeg)
for (const [i, im] of (json.images || []).entries()) {
  if (im.bufferView === undefined) continue;
  const bv = json.bufferViews[im.bufferView];
  const data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const isNormal = normalImages.has(i);
  const src = path.join(tmp, `img${i}.${im.mimeType === "image/jpeg" ? "jpg" : "png"}`);
  const dst = path.join(tmp, `img${i}.out.jpg`);
  fs.writeFileSync(src, data);
  const scale = isNormal ? scaleNormal : scaleColor;
  const vf = scale !== 1 ? ["-vf", `scale=iw*${scale}:ih*${scale}:flags=lanczos`] : [];
  /* Normal maps carry direction in R and G; chroma subsampling would smear
   * them, so they are written 4:4:4. Colour gets the ordinary 4:2:0. */
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, ...vf, "-q:v", isNormal ? qNormal : qColor, "-pix_fmt", isNormal ? "yuvj444p" : "yuvj420p", dst]);
  const jpg = fs.readFileSync(dst);
  console.log(`image ${i} ${im.name || ""}${isNormal ? " (normal)" : ""}: ${im.mimeType} ${data.length} B -> image/jpeg ${jpg.length} B${scale !== 1 ? ` at ${scale}x` : ""}`);
  im.mimeType = "image/jpeg";
  replaced.set(im.bufferView, jpg);
}

if (baseScale !== 1) {
  for (const m of json.materials || []) {
    const pbr = m.pbrMetallicRoughness || (m.pbrMetallicRoughness = {});
    const f = pbr.baseColorFactor || [1, 1, 1, 1];
    pbr.baseColorFactor = [f[0] * baseScale, f[1] * baseScale, f[2] * baseScale, f[3]];
  }
  console.log(`baseColorFactor scaled by ${baseScale} on ${(json.materials || []).length} materials`);
}

const dropped = new Set();   // bufferViews no longer referenced
if (flag("--drop-normals")) {
  for (const m of json.meshes || []) for (const p of m.primitives || []) {
    if (p.attributes.NORMAL !== undefined) { dropped.add(json.accessors[p.attributes.NORMAL].bufferView); delete p.attributes.NORMAL; }
    if (p.attributes.TANGENT !== undefined) { dropped.add(json.accessors[p.attributes.TANGENT].bufferView); delete p.attributes.TANGENT; }
  }
  // a bufferView is only droppable if nothing else points at it
  for (const a of json.accessors) if (a.bufferView !== undefined && dropped.has(a.bufferView)) {
    const still = json.meshes.some((m) => m.primitives.some((p) => Object.values(p.attributes).includes(json.accessors.indexOf(a)) || p.indices === json.accessors.indexOf(a)));
    if (still) dropped.delete(a.bufferView);
  }
  console.log(`dropped vertex normals (${dropped.size} bufferViews)`);
}

// rebuild the BIN chunk, keeping every remaining bufferView in its original order
const parts = [];
let offset = 0;
for (const [i, bv] of json.bufferViews.entries()) {
  let data;
  if (dropped.has(i)) data = Buffer.alloc(0);
  else if (replaced.has(i)) data = replaced.get(i);
  else data = bin.subarray(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  bv.byteOffset = offset;
  bv.byteLength = data.length;
  parts.push(data);
  offset += data.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { parts.push(Buffer.alloc(pad)); offset += pad; }
}
const newBin = Buffer.concat(parts);
json.buffers[0].byteLength = newBin.length;

let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
const jpad = (4 - (jsonBuf.length % 4)) % 4;
if (jpad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jpad, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + newBin.length, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBuf.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(newBin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(outFile, Buffer.concat([header, jh, jsonBuf, bh, newBin]));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${outFile}: ${buf.length} -> ${fs.statSync(outFile).size} B`);
