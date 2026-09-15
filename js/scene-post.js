/* Screen-space ambient occlusion for the site scene.
 *
 * The monuments here are extruded footprints, not scans. An extrusion lit by a
 * hemisphere light and one sun reads as a flat slab: every face takes the same
 * light, so the eye gets no cue for where a wall meets the ground or where one
 * mass sits in front of another. Contact shadow is that cue, and SSAO is the
 * cheapest way to get it without baking anything. It does not add detail — it
 * makes the shape that IS there read as a solid instead of a cut-out.
 *
 * Vendored three.js addons, same convention as the OrbitControls and GLTFLoader
 * already in assets/vendor: upstream files, unmodified except that the bare
 * 'three' specifier is rewritten to the vendored module, because this site has
 * no build step and nothing resolves bare specifiers.
 *
 * The pipeline is RenderPass -> SSAOPass -> OutputPass. SSAOPass has
 * needsSwap = false and multiplies its blurred AO term straight onto the read
 * buffer, so it must sit between the two, not at either end.
 */
import { EffectComposer } from "../assets/vendor/three-post/EffectComposer.js";
import { RenderPass } from "../assets/vendor/three-post/RenderPass.js";
import { SSAOPass } from "../assets/vendor/three-post/SSAOPass.js";
import { OutputPass } from "../assets/vendor/three-post/OutputPass.js";
import { NoBlending, WebGLRenderTarget, HalfFloatType } from "../assets/vendor/three.module.js";

/* AO geometry, in METRES, because the scene is in metres (1 unit = 1 m, the
 * contract at the top of js/scene-3d.js). These are not the three.js defaults
 * and must not be reset to them — see toDepthUnits() below for why.
 *
 * RADIUS is how far a sample reaches for an occluder. At 6 m it catches the
 * plinth of a ratha, the notch where a mandapa meets the granite and the
 * street canyons of the town, and stops short of shading whole hillsides —
 * which is what a large radius does on 4 km of terrain, and it looks like
 * dirt, not depth. */
const RADIUS_M = 6;
/* Ignore occluders nearer than this. Depth-buffer quantisation makes a flat
 * face occlude itself by a few centimetres; without a floor the whole scene
 * gets an even grey wash. */
const NEAR_M = 0.08;
/* Ignore occluders further than this. Stops the Shore Temple from casting AO
 * across the sea behind it — a haloed silhouette is the classic SSAO tell. */
const FAR_M = 20;

/* What the AO term costs, and the two numbers that keep it affordable.
 *
 * The first working version ran the AO buffers at full CSS size with the
 * upstream 32-sample kernel, and cost 2.8x a direct render on an Intel Iris Xe
 * — a mid-range integrated laptop GPU, and the realistic worst case for
 * someone reading this page. That is about 36fps while the camera moves,
 * against 60 before, which is not a trade worth making for contact shadow.
 *
 * SCALE runs the normal, AO and blur buffers at half the CSS size — a quarter
 * of the fill, which is where an integrated GPU actually spends its time. The
 * term is low-frequency and gets a 5x5 blur immediately afterwards, so there
 * is very little in it to lose by halving.
 *
 * SAMPLES is the occlusion kernel. 32 is the upstream default; 16 halves the
 * texture fetches in the inner loop. It costs some smoothness in the gradient,
 * which the blur then hides.
 *
 * Where that leaves it, measured on an Intel Iris Xe at 985x634 CSS
 * (dpr 1.25), close on the Shore Temple:
 *
 *   direct renderer.render()            ~5-6 ms
 *   through the composer, AO disabled   ~8-11 ms
 *   through the composer, AO enabled    ~17-19 ms
 *
 * So the whole package costs somewhere around 12 ms a frame there — roughly
 * 50fps while the camera moves. Ranges, not points, because the readings drift
 * by a few ms with framing and with how hard the GPU has been worked; see the
 * note in buildPost about throttling before trusting any single number, and
 * remeasure rather than reasoning about these. The MSAA setting there is not
 * independent of the two above.
 *
 * The scene renders on demand, so all of this is paid only while something is
 * moving. A still frame costs nothing either way.
 */
const SCALE = 0.5;
const SAMPLES = 16;

/* SSAOShader compares two ORTHOGRAPHIC depths, each normalised across
 * [camera.near, camera.far]. So a distance in metres is only meaningful once
 * divided by that span, and this camera's span is enormous (1 to 30000, set
 * wide so the 6 km apron and the globe both fit). The upstream defaults
 * (0.005 / 0.1) are written for a unit-scale demo scene; here they would mean
 * 150 m and 3000 m, and the pass would return no visible occlusion at all.
 * This is the one number that has to be derived rather than copied. */
const toDepthUnits = (metres, camera) => metres / (camera.far - camera.near);

export function buildPost({ renderer, scene, camera, width, height }) {
  /* Multisampling is the price of using a composer at all: renderer
   * antialias: true applies to the default framebuffer, which the scene is no
   * longer drawn into. Without samples here every roofline goes stair-stepped
   * against a pale sky, which is a worse regression than the AO is an
   * improvement.
   *
   * Two samples, and the reason is not a small one.
   *
   * The obvious reading is that 4x is worth it. RenderPass + OutputPass alone,
   * no AO, on an Intel Iris Xe:
   *
   *   4x MSAA, half-float   14.2 ms
   *   2x MSAA, half-float    9.5 ms
   *   no MSAA, half-float    8.5 ms
   *
   * — which makes 4x look like it costs about 5 ms. It does not, once the AO
   * pass is in the pipeline, and that table is exactly the mistake to avoid.
   * SSAOPass has needsSwap = false: it blends its AO term INTO the read
   * buffer, so raising the sample count multiplies the cost of a fullscreen
   * read-modify-write over half-float samples, on a GPU sharing system memory.
   * Whole-frame cost with AO enabled, first measurement after the camera
   * settles, fresh page:
   *
   *   2x MSAA + AO   ~17-19 ms
   *   4x MSAA + AO   ~41 ms
   *
   * The composer WITHOUT AO costs about the same either way (10.0 vs 10.6 ms),
   * so the difference lands entirely on the AO pass: the two settings
   * interact, and neither can be judged from a measurement taken with the
   * other removed.
   *
   * Treat those two figures as indicative, not precise. This GPU throttles
   * under sustained benchmarking — a second back-to-back run of the same
   * measurement reaches 50 ms at EITHER sample count — so only the first
   * reading after an idle period is worth anything, and the gap between them
   * was not isolated from that. What is solid is the direction and the
   * mechanism, not the decimal places.
   *
   * 4x may well be affordable on a discrete GPU; that was never checked. If it
   * is raised, remeasure with the AO pass ENABLED and on a cold GPU.
   *
   * An 8-bit buffer would cut the same traffic and is declined on purpose: the
   * intermediate holds LINEAR colour, and 8 bits of linear bands visibly — in
   * exactly the darks this pass exists to create. */
  const dpr = renderer.getPixelRatio();
  const target = new WebGLRenderTarget(width * dpr, height * dpr, {
    type: HalfFloatType,
    samples: 2,
  });

  const composer = new EffectComposer(renderer, target);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));

  const ssao = new SSAOPass(scene, camera, width, height, SAMPLES);
  ssao.kernelRadius = RADIUS_M;
  ssao.minDistance = toDepthUnits(NEAR_M, camera);
  ssao.maxDistance = toDepthUnits(FAR_M, camera);
  ssao.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssao);
  sizeAo(ssao, width, height);

  excludeNonOccluders(ssao, scene);

  const output = new OutputPass();
  /* The canvas is transparent — alpha: true, with the sky a CSS gradient
   * behind it (css/scene-3d.css). The final quad must therefore WRITE rgba
   * rather than blend over the framebuffer, or the sky region composites
   * against itself and the gradient behind the canvas is lost. */
  output.material.blending = NoBlending;
  composer.addPass(output);

  return {
    composer,
    ssao,
    render() {
      composer.render();
    },
    setSize(w, h) {
      composer.setSize(w, h);
      /* Must come AFTER composer.setSize, which hands every pass the full CSS
       * size and would otherwise undo the halving. */
      sizeAo(ssao, w, h);
    },
    dispose() {
      ssao.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}

/* The AO buffers, at SCALE of the CSS size.
 *
 * Note this is CSS size, not device pixels: EffectComposer.setSize hands its
 * passes the CSS size while sizing its own beauty buffer at the device pixel
 * ratio. So on a 2x display the AO is already running at half density before
 * SCALE is applied at all, and the visible cost of both together is still just
 * a slightly softer gradient. */
function sizeAo(ssao, w, h) {
  ssao.setSize(Math.max(1, Math.round(w * SCALE)), Math.max(1, Math.round(h * SCALE)));
}

/* Keep the cut-out foliage out of the occluder pass.
 *
 * SSAOPass renders the scene a second time with a MeshNormalMaterial override
 * to fill a normal+depth buffer, and that override ignores maps entirely —
 * transparency, alpha test, everything. The 142 palms in this scene are
 * THREE.Sprites: a palm-shaped texture on a quad, drawn with depthWrite off so
 * it never punches a hole in what is behind it. Under the override they come
 * back as 142 opaque RECTANGLES in the depth buffer, and the AO term duly
 * shades a neat grey box around every tree. Seen, not predicted — it is the
 * one visible artifact this pass introduced.
 *
 * Upstream only excludes Points and Lines, so the rule is extended here rather
 * than by editing the vendored file, which stays a clean copy of r169. An
 * object earns its place as an occluder by being solid: a sprite is not, and
 * neither is anything that declines to write depth in the beauty pass.
 */
function excludeNonOccluders(ssao, scene) {
  const upstream = ssao.overrideVisibility.bind(ssao);
  ssao.overrideVisibility = () => {
    /* Upstream first: it fills the visibility cache that restoreVisibility()
     * reads back, so anything hidden after this call is still restored. */
    upstream();
    scene.traverse((o) => {
      if (!o.visible) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (o.isSprite || (m && (m.transparent || m.depthWrite === false))) o.visible = false;
    });
  };
}

/* Whether to run this at all is decided in js/scene-3d.js (wantsPost there):
 * this module is a dynamic import now, so the decision has to be made before
 * it is fetched. The reasoning is kept here because it is about this code:
 * SSAO adds a full normal+depth pass over every mesh plus three fullscreen
 * passes — affordable on a desktop that renders on demand, not on a phone
 * where the monuments are a few hundred pixels tall and the AO would be paid
 * for and barely seen. So: full tier, viewport >= 720 px, no body.no-ssao. */
