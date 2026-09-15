/* The opening globe.
 *
 * A line-drawn Earth rather than a textured one, and that is a decision not a
 * shortcut: a photoreal globe needs a licensed satellite basemap, and a
 * low-resolution stand-in would look worse than an honest drawing. Coastlines
 * come from Natural Earth 110m (public domain) via scripts/build-globe.js, so
 * the shapes are real even though the styling is graphic.
 *
 * India is drawn brighter and carries the clickable hotspot; the site sits
 * under a marker on the Coromandel coast.
 */
import * as THREE from "../assets/vendor/three.module.js";

export const R = 100; // globe radius in scene units

/* Geographic to Cartesian on a sphere of radius r. Y is the polar axis so the
 * globe spins about Y like every other object in the scene. */
export function lngLatToVec3(lng, lat, r = R) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

function ringToLine(ring, colour, lift, width) {
  const pts = ring.map(([lng, lat]) => lngLatToVec3(lng, lat, R + lift));
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, linewidth: width || 1 }));
}

export function buildGlobe({ world, siteLngLat, indiaBounds }) {
  const group = new THREE.Group();
  group.name = "globe";

  /* The ocean sphere, very slightly smaller than the coastlines so the lines
   * never z-fight with it. */
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(R - 0.4, 64, 48),
    new THREE.MeshLambertMaterial({ color: 0xcfd8d4 })
  );
  group.add(sphere);

  /* A faint graticule. It is what makes a sphere read as a globe rather than a
   * ball — without it there is no cue that it is rotating. */
  const grat = new THREE.Group();
  const gratMat = new THREE.LineBasicMaterial({ color: 0xb9a67f, transparent: true, opacity: 0.28 });
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = [];
    for (let lng = -180; lng <= 180; lng += 4) pts.push(lngLatToVec3(lng, lat, R + 0.1));
    grat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }
  for (let lng = -180; lng < 180; lng += 30) {
    const pts = [];
    for (let lat = -85; lat <= 85; lat += 4) pts.push(lngLatToVec3(lng, lat, R + 0.1));
    grat.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat));
  }
  group.add(grat);

  /* Coastlines. India's rings are picked out by a bounding-box test rather than
   * by name, because the 110m land layer is LAND, not countries — the Indian
   * subcontinent is one ring shared with its neighbours, and there is no
   * attribute to filter on. The box is deliberately generous; it is a highlight,
   * not a border claim. */
  const inIndia = (ring) => {
    let inside = 0;
    for (const [lng, lat] of ring) {
      if (lng > indiaBounds[0] && lng < indiaBounds[2] && lat > indiaBounds[1] && lat < indiaBounds[3]) inside++;
    }
    return inside / ring.length > 0.25;
  };

  for (const ring of world.rings) {
    const hot = inIndia(ring);
    group.add(ringToLine(ring, hot ? 0x8c6a2a : 0xa9a08c, hot ? 0.6 : 0.3));
  }

  /* The click target.
   *
   * This was a flat disc tangent to the sphere, and it was genuinely hard to
   * hit: small, and — being flat — foreshortening badly whenever India sat away
   * from the centre of the globe. It is now a spherical CAP that hugs the
   * surface, so it keeps its apparent size and shape wherever the globe has
   * turned to.
   *
   * The hit test does not use this mesh at all (see hitTestIndia below); the
   * cap is purely what you see. Keeping the two separate means the visible
   * target can be honest about where India is while the clickable area stays a
   * little more forgiving than the drawing. */
  const axis = lngLatToVec3(
    (indiaBounds[0] + indiaBounds[2]) / 2,
    (indiaBounds[1] + indiaBounds[3]) / 2,
    1
  ).normalize();

  function cap(radiusDeg, r, colour, opacity) {
    // An orthonormal basis around the cap's axis.
    const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(up, axis).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
    const RINGS = 10;
    const SEGS = 48;
    const max = THREE.MathUtils.degToRad(radiusDeg);
    const verts = [];
    const faces = [];
    for (let i = 0; i <= RINGS; i++) {
      const a = (i / RINGS) * max;
      for (let j = 0; j < SEGS; j++) {
        const b = (j / SEGS) * Math.PI * 2;
        const dir = axis.clone().multiplyScalar(Math.cos(a))
          .addScaledVector(e1, Math.sin(a) * Math.cos(b))
          .addScaledVector(e2, Math.sin(a) * Math.sin(b));
        verts.push(dir.x * r, dir.y * r, dir.z * r);
      }
    }
    for (let i = 0; i < RINGS; i++) {
      for (let j = 0; j < SEGS; j++) {
        const k = (j + 1) % SEGS;
        const a0 = i * SEGS + j, b0 = i * SEGS + k;
        const a1 = (i + 1) * SEGS + j, b1 = (i + 1) * SEGS + k;
        faces.push(a0, b0, b1, a0, b1, a1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(faces);
    g.computeVertexNormals();
    return new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false })
    );
  }

  const HOTSPOT_DEG = 17;      // what you see
  const hotspot = cap(HOTSPOT_DEG, R + 0.45, 0xa67c2e, 0.30);
  hotspot.name = "india-hotspot";
  group.add(hotspot);

  /* A drawn rim at the cap's edge. The soft fill alone read as a smudge on the
   * grey ocean rather than as something you are meant to press; the ring is what
   * makes it legible as a target. It follows the sphere, so it stays a clean
   * circle at any rotation. */
  function ring(radiusDeg, r, opacity) {
    const up = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(up, axis).normalize();
    const e2 = new THREE.Vector3().crossVectors(axis, e1).normalize();
    const a = THREE.MathUtils.degToRad(radiusDeg);
    const pts = [];
    for (let j = 0; j <= 96; j++) {
      const b = (j / 96) * Math.PI * 2;
      pts.push(
        axis.clone().multiplyScalar(Math.cos(a))
          .addScaledVector(e1, Math.sin(a) * Math.cos(b))
          .addScaledVector(e2, Math.sin(a) * Math.sin(b))
          .multiplyScalar(r)
      );
    }
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x8c6a2a, transparent: true, opacity })
    );
  }

  const rim = ring(HOTSPOT_DEG, R + 0.55, 0.75);
  rim.name = "india-rim";
  group.add(rim);

  /* The site itself: a small raised pin so there is somewhere specific to go. */
  const siteVec = lngLatToVec3(siteLngLat[0], siteLngLat[1], R + 0.5);
  const pin = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.012, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xa67c2e })
  );
  pin.position.copy(siteVec);
  group.add(pin);

  /* Is a ray pointing at India?
   *
   * Tested against the SPHERE and an angle, not against the hotspot mesh. Two
   * reasons, both learned the hard way while trying to click the thing:
   *  - the globe spins, so the target has to be resolved in the globe's own
   *    rotated frame rather than against a mesh in whatever pose it happens
   *    to be in;
   *  - an angular tolerance stays constant as the globe turns, whereas a flat
   *    disc shrinks to a sliver near the limb.
   * The tolerance is deliberately wider than the drawn cap: forgiving to click,
   * honest to look at. */
  const HIT_DEG = 23;
  const cosHit = Math.cos(THREE.MathUtils.degToRad(HIT_DEG));
  const _local = new THREE.Vector3();

  function hitTestIndia(raycaster) {
    const hits = raycaster.intersectObject(sphere, false);
    if (!hits.length) return false;
    _local.copy(hits[0].point);
    group.worldToLocal(_local).normalize();
    return _local.dot(axis) > cosHit;
  }

  /* Highlight on hover, so the target is discoverable before it is clicked. */
  function setHover(on) {
    hotspot.material.opacity = on ? 0.46 : 0.30;
    rim.material.opacity = on ? 1.0 : 0.75;
  }

  return { group, hotspot, siteVec, sphere, hitTestIndia, setHover, axis };
}
