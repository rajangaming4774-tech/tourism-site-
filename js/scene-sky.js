/* The sky, the sun's direction, and the light the sky throws back.
 *
 * Before this module there was no sky: the canvas was transparent over a CSS
 * gradient, the fog faded to one colour and the gradient was another, and the
 * board ended against flat cream. Two lights, no tone mapping, no environment.
 *
 * WHAT THIS IS. Preetham-style atmospheric scattering (three.js's own Sky
 * addon, vendored in assets/vendor/three-post/) — a physically-based sky
 * gradient with a sun disc and horizon haze — rendered ONCE into a
 * pre-filtered environment map so every MeshStandardMaterial in the scene is
 * lit by the sky it is standing under. No HDRI file, no download: the sky is
 * computed, so it costs 2.75 KB of code and nothing else.
 *
 * WHAT IT CLAIMS. Nothing. A sky and a sun make no statement about the place
 * (README, "where the honesty line falls"): they are purely optical, so unlike
 * the palms or the town infill they carry no on-screen declaration. The ONE
 * thing worth saying out loud lives in the provenance line for the ground
 * photograph instead: the satellite image was taken mid-morning with the sun
 * in the south-east, and this sky is a late-afternoon one with the sun in the
 * south-west. The two disagree, faintly, and that is stated rather than hidden.
 *
 * THE SUN IS SHARED. The same direction drives the sun disc in the sky, the
 * DirectionalLight that casts the shadows, and the environment map — so the
 * three can never disagree about where the light comes from. The bearing and
 * elevation are the ones the scene already had (a low south-west sun: 230°,
 * 26°), kept because long raking shadows are what make a 26 m ridge and a row
 * of 8 m buildings read as relief from the air.
 */
import * as THREE from "../assets/vendor/three.module.js";
import { Sky } from "../assets/vendor/three-post/Sky.js";

/* The horizon veil.
 *
 * Fog and sky are computed in different colour spaces on the two render paths
 * (see setFogColour below), so asking one fog hex to match the sky's horizon
 * to the byte is a losing game — any mismatch draws a line where the ground
 * meets the air. This is a huge open cylinder far outside everything, painted
 * fog colour at its base and fading to transparent 2.6 km up. At 20 km it is
 * 100 % fog in whichever space that path uses, so the far apron and sea always
 * meet it exactly; above that it dissolves into the tone-mapped sky over a few
 * degrees. One draw call, no texture. */
function buildVeil() {
  const R = 20000, H = 2600;
  const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true);
  const pos = geo.attributes.position;
  const rgba = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getY(i) + H / 2) / H;   // 0 at the base, 1 at the top
    rgba[i * 4] = 1; rgba[i * 4 + 1] = 1; rgba[i * 4 + 2] = 1;
    rgba[i * 4 + 3] = 1 - k;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    fog: true,
  });
  const veil = new THREE.Mesh(geo, mat);
  veil.position.y = -300;
  veil.name = "horizon-veil";
  veil.renderOrder = -1;
  return veil;
}

export function buildSky({ renderer, bearingDeg = 230, elevationDeg = 26 }) {
  const sky = new Sky();
  sky.name = "sky";
  /* The Sky's vertex shader pins it to the far plane whatever its scale, so
   * this only has to enclose the camera — the widest orbit is 2.6 km. */
  sky.scale.setScalar(20000);

  /* Humid coastal air in the late afternoon: turbidity up for the haze and a
   * warm glow round a low sun, rayleigh a little above default so the zenith
   * stays properly blue. First pass was 7 / 1.6 / 0.006 and the horizon went
   * near-white — which then came back as a milky sea at the grazing hero
   * pitch, since the water reflects it. Backed off to a clearer, still humid,
   * sky. */
  /* The VISIBLE sky is dimmed to 49 % in its own shader. Sky.js was tuned
   * for the three.js example's exposure of 0.5; at this scene's calibrated
   * 0.9 (set by the photograph, not the sky) the zenith rendered at 242/255 —
   * white, not blue. 0.49 = 0.55 x 0.8 / 0.9: the gain that read right at
   * exposure 0.8, rescaled when the calibration moved the exposure, so the
   * sky's brightness did not move with the ground's. The gain is applied to
   * the drawn sky only: the environment map below is generated at full
   * strength, so nothing about the lighting changes. */
  const OUT = "gl_FragColor = vec4( retColor, 1.0 );";
  if (!sky.material.fragmentShader.includes(OUT)) throw new Error("Sky.js changed: output line not found");
  sky.material.fragmentShader = sky.material.fragmentShader.replace(OUT, "gl_FragColor = vec4( retColor * 0.49, 1.0 );");
  const u = sky.material.uniforms;
  u.turbidity.value = 5;
  u.rayleigh.value = 1.3;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;

  /* Bearing is compass degrees clockwise from north; elevation above the
   * horizon. In this scene +X is east and -Z is north, and
   * setFromSphericalCoords puts theta=0 on +Z, so theta = π - bearing lands
   * a 230° sun in the south-west: x negative (west), z positive (south).
   * Checked against the (-900, 760) the DirectionalLight already used. */
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - elevationDeg),
    Math.PI - THREE.MathUtils.degToRad(bearingDeg)
  );
  u.sunPosition.value.copy(sunDir);

  /* The environment map, made once. The sun does not move, so this never
   * needs regenerating; if it ever does, that is the only thing that changes
   * and it must happen outside the frame loop. */
  const t0 = performance.now();
  /* WITHOUT the sun disc. The DirectionalLight already IS the sun — a disc
   * in the environment map would light everything twice, and Sky.js draws it
   * at 19000x the sky's radiance, which the PMREM prefilter smears into a
   * glow the size of the sky. The sea found that first: at the hero pitch
   * its whole nearshore reflected the glow as a milky sheet. So the map is
   * rendered from a second Sky with the same uniforms and the one disc line
   * cut from its shader; the visible sky keeps its disc. */
  const envSky = new Sky();
  envSky.scale.setScalar(20000);
  const DISC = "L0 += ( vSunE * 19000.0 * Fex ) * sundisk;";
  if (!envSky.material.fragmentShader.includes(DISC)) throw new Error("Sky.js changed: sun-disc line not found");
  envSky.material.fragmentShader = envSky.material.fragmentShader.replace(DISC, "");
  for (const k of ["turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG"]) envSky.material.uniforms[k].value = u[k].value;
  envSky.material.uniforms.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tmp = new THREE.Scene();
  tmp.add(envSky);
  const env = pmrem.fromScene(tmp);
  tmp.remove(envSky);
  envSky.material.dispose();
  envSky.geometry.dispose();
  pmrem.dispose();
  const envMs = performance.now() - t0;

  const veil = buildVeil();

  /* Fog colour, correctly, on BOTH render paths.
   *
   * Verified in the vendored r169 shader chunks: on the direct path fog is
   * mixed in AFTER tone mapping and colour-space encoding, i.e. in display
   * sRGB; on the composer path the render target is linear, so fog is mixed in
   * linear light and tone-mapped afterwards by OutputPass. One hex therefore
   * looks different in the two. So: composer → set the colour normally (it is
   * converted to linear, and tone-mapped later, like everything else); direct
   * → hand it the display numbers untouched so they are mixed post-encode. */
  function setFogColour(fog, hex, viaComposer) {
    if (viaComposer) fog.color.set(hex);
    else {
      const c = new THREE.Color(hex);
      fog.color.setRGB(c.r, c.g, c.b, THREE.LinearSRGBColorSpace);
    }
  }

  return { sky, veil, sunDir, envTexture: env.texture, envMs, setFogColour };
}
