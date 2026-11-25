// Fuffie — real-time 3D coffee story (Three.js), driven by the page scroll.
// Everything is modelled in code: bean, grinder, glass, coffee, caramel ribbon, cup, bags.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const canvas = document.getElementById("gl");
const MOBILE = matchMedia("(max-width: 760px)").matches;
const LOW = MOBILE || (navigator.hardwareConcurrency || 8) <= 4;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  throw e; // keep the photo frames as the fallback
}
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
key.position.set(3.5, 6, 5);
key.castShadow = true;
key.shadow.mapSize.set(LOW ? 512 : 1024, LOW ? 512 : 1024);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
key.shadow.radius = 6;
key.shadow.bias = -0.0008;
scene.add(key);
scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a5232, 0.55));
const rim = new THREE.DirectionalLight(0xffd9a8, 0.9);
rim.position.set(-4, 2, -3);
scene.add(rim);

const world = new THREE.Group();
scene.add(world);

/* ---------------- helpers ---------------- */
const clamp = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const ease = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(7);
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(ctx, w, h, a, n = 9000) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(${rand() < 0.5 ? "0,0,0" : "255,255,255"},${a * rand()})`; ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
}

/* ---------------- materials ---------------- */
const beanBump = canvasTex(256, 256, (c, w, h) => { c.fillStyle = "#808080"; c.fillRect(0, 0, w, h); noise(c, w, h, 0.5, 6000); }, false);
const M = {
  bean: new THREE.MeshPhysicalMaterial({ color: 0x3b2213, roughness: 0.34, clearcoat: 0.85, clearcoatRoughness: 0.28, bumpMap: beanBump, bumpScale: 0.6 }),
  beanSmall: new THREE.MeshPhysicalMaterial({ color: 0x45281a, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
  matte: new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.55, metalness: 0.25 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9964f, roughness: 0.22, metalness: 1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 1 }),
  ceramic: new THREE.MeshPhysicalMaterial({ color: 0xf7f1e8, roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
  pedestal: new THREE.MeshStandardMaterial({ color: 0xece0cc, roughness: 0.75 }),
  coffee: new THREE.MeshPhysicalMaterial({ color: 0x1f0c04, sheen: 0.5, sheenColor: 0x7a3c14, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
  caramel: new THREE.MeshPhysicalMaterial({ color: 0xc6701c, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x3a1500, emissiveIntensity: 0.25, sheen: 0.4, sheenColor: 0xffc27a }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4, side: THREE.FrontSide, depthWrite: false }),
  rim: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1, envMapIntensity: 2 }),
  amber: LOW
    ? new THREE.MeshPhysicalMaterial({ color: 0xe8a038, roughness: 0.08, clearcoat: 1, emissive: 0x6a3300, emissiveIntensity: 0.25 })
    : new THREE.MeshPhysicalMaterial({ color: 0xf0a43c, roughness: 0.05, transmission: 0.75, thickness: 0.6, ior: 1.4, clearcoat: 1, attenuationColor: new THREE.Color(0xc0600a), attenuationDistance: 0.4 })
};

/* ---------------- the bean ---------------- */
// unit-sphere point -> coffee-bean surface (oval body + S-shaped crease on the flat front)
function beanShape(v) {
  const { x, y, z } = v;
  const cx = 0.07 * Math.sin(y * 2.4);
  const w = Math.exp(-Math.pow((x - cx) / 0.13, 2));
  const front = THREE.MathUtils.smoothstep(z, 0.02, 0.55);
  let nz = z - 0.38 * w * front * (1 - Math.abs(y) * 0.55);
  if (nz < 0) nz *= 0.82;
  v.set(x * 0.74, y, nz * 0.62);
}
function beanGeo(phiStart, phiLen, ws, hs) {
  const g = new THREE.SphereGeometry(1, ws, hs, phiStart, phiLen);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); beanShape(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
// the flat inside face of a split half, traced from the real seam so it closes the shell exactly
function capGeo() {
  const pts = [], v = new THREE.Vector3(), N = 64;
  for (let i = 0; i <= N; i++) { const th = (i / N) * Math.PI; v.set(0, Math.cos(th), Math.sin(th)); beanShape(v); pts.push(new THREE.Vector2(v.z, v.y)); }
  for (let i = N; i >= 0; i--) { const th = (i / N) * Math.PI; v.set(0, Math.cos(th), -Math.sin(th)); beanShape(v); pts.push(new THREE.Vector2(v.z, v.y)); }
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  const uv = g.attributes.uv, pos = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + 0.65) / 1.3, (pos.getY(i) + 1) / 2);
  return g;
}
const innerTex = canvasTex(256, 512, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#b88552"); g.addColorStop(0.5, "#d8aa72"); g.addColorStop(1, "#b88552");
  c.fillStyle = g; c.fillRect(0, 0, w, h); noise(c, w, h, 0.35, 5000);
  c.strokeStyle = "#5a3418"; c.lineWidth = 6; c.lineJoin = "round"; c.beginPath(); c.moveTo(w / 2, 10);
  for (let y = 10; y < h - 10; y += 22) c.lineTo(w / 2 + (rand() - 0.5) * 26, y);
  c.stroke();
  c.lineWidth = 2; for (let k = 0; k < 14; k++) { c.beginPath(); const y = 40 + rand() * (h - 80); c.moveTo(w / 2, y); c.lineTo(w / 2 + (rand() - 0.5) * 120, y + (rand() - 0.5) * 60); c.stroke(); }
});
const M_inner = new THREE.MeshStandardMaterial({ map: innerTex, roughness: 0.85, side: THREE.DoubleSide });

const bean = new THREE.Group();
const halves = [-1, 1].map((side) => {
  const h = new THREE.Group();
  const shell = new THREE.Mesh(beanGeo(side < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI, LOW ? 48 : 96, LOW ? 36 : 72), M.bean);
  shell.castShadow = true;
  const cap = new THREE.Mesh(capGeo(), M_inner);
  cap.rotation.y = -Math.PI / 2;
  h.add(shell, cap);
  bean.add(h);
  return h;
});
world.add(bean);

/* ---------------- small beans (instanced) ---------------- */
const N_BEANS = LOW ? 70 : 130;
const smallGeo = beanGeo(0, Math.PI * 2, 18, 12);
const beans = new THREE.InstancedMesh(smallGeo, M.beanSmall, N_BEANS);
beans.castShadow = true;
beans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
world.add(beans);
const B = [];
for (let i = 0; i < N_BEANS; i++) {
  const th = rand() * Math.PI * 2, ph = Math.acos(2 * rand() - 1), r = 1.4 + rand() * 2.4;
  B.push({
    dir: new THREE.Vector3(Math.sin(ph) * Math.cos(th) * 1.35, Math.cos(ph) * 0.85, Math.sin(ph) * Math.sin(th) * 0.8).multiplyScalar(r),
    spin: new THREE.Vector3(rand() * 6 - 3, rand() * 6 - 3, rand() * 6 - 3),
    jx: (rand() - 0.5) * 0.7, jz: (rand() - 0.5) * 0.5,
    k: rand(), s: 0.11 + rand() * 0.06
  });
}
const dummy = new THREE.Object3D();

/* ---------------- pedestal ---------------- */
const FLOOR = -1.76;
const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.2, 96), M.pedestal);
pedestal.position.y = FLOOR - 0.1;
pedestal.receiveShadow = true;
world.add(pedestal);

/* ---------------- grinder ---------------- */
const grinder = new THREE.Group();
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 1.0, 64), M.matte); base.position.y = FLOOR + 0.5; base.castShadow = true;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 64), M.gold); collar.position.y = FLOOR + 1.03;
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.54, 0.62, 64, 1, true), M.glass); hopper.position.y = FLOOR + 1.37; hopper.renderOrder = 2;
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 12, 64), M.matte); lid.rotation.x = Math.PI / 2; lid.position.y = FLOOR + 1.68;
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 40), M.gold); knob.rotation.x = Math.PI / 2; knob.position.set(0.34, FLOOR + 0.42, 0.6);
  grinder.add(base, collar, hopper, lid, knob);
  const inside = new THREE.InstancedMesh(smallGeo, M.beanSmall, 26);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 0.42;
    dummy.position.set(Math.cos(a) * r, FLOOR + 1.12 + rand() * 0.22, Math.sin(a) * r);
    dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6); dummy.scale.setScalar(0.12); dummy.updateMatrix();
    inside.setMatrixAt(i, dummy.matrix);
  }
  grinder.add(inside);
}
world.add(grinder);

/* ---------------- glass + coffee + caramel ---------------- */
const glass = new THREE.Group();
const G_TOP = 0.2, G_BOT = FLOOR, IN_BOT = FLOOR + 0.15;
const rIn = (y) => 0.52 + ((y - IN_BOT) / (G_TOP - IN_BOT)) * 0.15;
{
  const prof = [new THREE.Vector2(0.0, G_BOT), new THREE.Vector2(0.55, G_BOT), new THREE.Vector2(0.73, G_TOP), new THREE.Vector2(0.69, G_TOP), new THREE.Vector2(0.53, IN_BOT), new THREE.Vector2(0.0, IN_BOT)];
  const m = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), M.glass);
  m.renderOrder = 2;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.022, 12, 72), M.rim); lip.rotation.x = Math.PI / 2; lip.position.y = G_TOP; lip.renderOrder = 3;
  const foot = new THREE.Mesh(new THREE.TorusGeometry(0.545, 0.03, 12, 72), M.rim); foot.rotation.x = Math.PI / 2; foot.position.y = G_BOT + 0.03; foot.renderOrder = 3;
  glass.add(m, lip, foot);
}
const liquid = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 56), M.coffee);
glass.add(liquid);
const swirlTex = canvasTex(512, 512, (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); g.addColorStop(0, "#6b3a18"); g.addColorStop(0.7, "#3b1d0c"); g.addColorStop(1, "#24110a");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let k = 0; k < 7; k++) {
    c.beginPath(); c.lineWidth = 8 + rand() * 14; c.strokeStyle = `rgba(${200 + rand() * 40},${130 + rand() * 40},${70 + rand() * 30},${0.45 + rand() * 0.3})`;
    for (let t = 0; t < 1; t += 0.01) { const a = t * Math.PI * 4 + k, r = t * w * 0.48; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    c.stroke();
  }
  noise(c, w, h, 0.2, 3000);
});
const liquidTop = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshPhysicalMaterial({ map: swirlTex, roughness: 0.15, clearcoat: 1 }));
liquidTop.rotation.x = -Math.PI / 2;
glass.add(liquidTop);
let lastFill = -1;
function setFill(f) {
  if (Math.abs(f - lastFill) < 0.002) return;
  lastFill = f;
  const top = IN_BOT + f * (G_TOP - 0.08 - IN_BOT);
  liquid.visible = liquidTop.visible = f > 0.01;
  if (!liquid.visible) return;
  liquid.geometry.dispose();
  liquid.geometry = new THREE.CylinderGeometry(rIn(top) - 0.015, rIn(IN_BOT) - 0.015, top - IN_BOT, 56);
  liquid.position.y = (top + IN_BOT) / 2;
  liquidTop.position.y = top + 0.002;
  liquidTop.scale.setScalar(rIn(top) - 0.016);
}
// caramel ribbon spiralling around the glass
const ribbonCurve = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, i) => {
  const t = i / 59, a = t * Math.PI * 3.3 - 1.2;
  return new THREE.Vector3(Math.cos(a) * (0.98 + 0.12 * Math.sin(t * 7)), G_BOT + 0.25 + t * 2.0, Math.sin(a) * (0.98 + 0.12 * Math.sin(t * 7)));
}));
const RIB_SEG = 320, RIB_RAD = 12;
const ribbonGeo = new THREE.TubeGeometry(ribbonCurve, RIB_SEG, 0.075, RIB_RAD, false);
ribbonGeo.scale(1, 1, 1);
const ribbon = new THREE.Mesh(ribbonGeo, M.caramel);
ribbon.castShadow = true;
glass.add(ribbon);
const RIB_COUNT = ribbonGeo.index.count;
world.add(glass);

/* ---------------- cup ---------------- */
const cup = new THREE.Group();
{
  const prof = [[0, 0.02], [0.42, 0.02], [0.5, 0.1], [0.7, 0.5], [0.8, 0.95], [0.83, 0.98], [0.78, 0.98], [0.68, 0.55], [0.42, 0.14], [0, 0.14]].map((p) => new THREE.Vector2(p[0], p[1]));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 72), M.ceramic); body.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.065, 18, 40, Math.PI * 1.25), M.ceramic);
  handle.position.set(0.86, 0.55, 0); handle.rotation.z = -Math.PI * 0.62; handle.castShadow = true;
  const sauce = [[0, 0], [1.05, 0.0], [1.22, 0.07], [1.18, 0.09], [0.5, 0.03], [0, 0.03]].map((p) => new THREE.Vector2(p[0], p[1]));
  const saucer = new THREE.Mesh(new THREE.LatheGeometry(sauce, 72), M.ceramic); saucer.receiveShadow = true; saucer.castShadow = true;
  cup.add(body, handle, saucer);
}
const latteTex = canvasTex(512, 512, (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w / 2); g.addColorStop(0, "#d9a066"); g.addColorStop(0.75, "#b0703a"); g.addColorStop(1, "#6e3c1a");
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = "rgba(255,248,236,.95)";
  // rosetta: stacked leaves + heart + stem
  for (let i = 0; i < 9; i++) {
    const y = h * 0.74 - i * 34, rx = 150 - i * 13, ry = 26;
    c.beginPath(); c.ellipse(w / 2, y, rx, ry, 0, Math.PI, 0); c.ellipse(w / 2, y + 6, rx - 18, ry - 8, 0, 0, Math.PI, true); c.fill();
  }
  c.beginPath(); c.arc(w / 2, h * 0.27, 42, 0, Math.PI * 2); c.fill();
  c.strokeStyle = "rgba(255,248,236,.95)"; c.lineWidth = 7; c.beginPath(); c.moveTo(w / 2, h * 0.2); c.lineTo(w / 2, h * 0.86); c.stroke();
  noise(c, w, h, 0.12, 2500);
});
const cupDark = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshPhysicalMaterial({ map: swirlTex, roughness: 0.15, clearcoat: 1 }));
const cupLatte = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshPhysicalMaterial({ map: latteTex, roughness: 0.4, clearcoat: 0.4, transparent: true, opacity: 0 }));
[cupDark, cupLatte].forEach((m) => { m.rotation.x = -Math.PI / 2; cup.add(m); });
cup.position.y = FLOOR + 0.0;
world.add(cup);
const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1, 20, 1, true), M.coffee);
world.add(stream);

/* ---------------- bags ---------------- */
function labelTex(bg, title, sub, ink) {
  return canvasTex(512, 768, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h); noise(c, w, h, 0.12, 9000);
    c.fillStyle = "rgba(0,0,0,.12)"; c.fillRect(0, 0, w, 70);
    c.fillStyle = ink; c.textAlign = "center";
    c.font = '800 112px "Playfair Display", Georgia, serif'; c.fillText("Fuffie", w / 2, 300);
    c.font = '500 24px "IBM Plex Sans Arabic", sans-serif'; c.fillText("COFFEE ROASTERS", w / 2, 345);
    c.fillRect(w / 2 - 60, 380, 120, 3);
    c.font = '700 56px "Reem Kufi", sans-serif'; c.direction = "rtl"; c.fillText(title, w / 2, 470);
    c.font = '500 30px "IBM Plex Sans Arabic", sans-serif'; c.fillText(sub, w / 2, 525);
    c.beginPath(); c.ellipse(w / 2, 630, 34, 48, -0.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = bg; c.lineWidth = 6; c.beginPath(); c.moveTo(w / 2 - 10, 590); c.quadraticCurveTo(w / 2 + 20, 630, w / 2 - 4, 672); c.stroke();
  });
}
function bag(bg, ink, title, sub) {
  const geo = new RoundedBoxGeometry(1.05, 1.55, 0.42, 4, 0.07);
  const side = new THREE.MeshStandardMaterial({ color: bg, roughness: 0.82 });
  const front = new THREE.MeshStandardMaterial({ map: labelTex(bg, title, sub, ink), roughness: 0.78 });
  const m = new THREE.Mesh(geo, [side, side, side, side, front, side]);
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m); world.add(g);
  return g;
}
let bags = [];
const fontsReady = document.fonts ? Promise.all(['800 112px "Playfair Display"', '700 56px "Reem Kufi"', '500 30px "IBM Plex Sans Arabic"'].map((f) => document.fonts.load(f))).catch(() => {}) : Promise.resolve();
fontsReady.then(() => {
  bags = [bag("#8b5a34", "#fbf3e4", "خلطة البيت", "250 جم · حبوب كاملة"), bag("#efe2c9", "#3b2213", "محصول منفرد", "250 جم · حبوب كاملة")];
});

/* ---------------- floating decor ---------------- */
const decor = [];
[[-2.1, 1.3, -0.8, 0.2, "chrome"], [2.0, -0.6, -0.4, 0.16, "chrome"], [-1.4, -1.3, 0.6, 0.12, "chrome"], [1.6, 1.6, -1.2, 0.24, "chrome"],
 [-1.8, 0.1, 0.4, 0.09, "amber"], [1.4, 0.6, 0.6, 0.11, "amber"], [-0.9, 1.9, -0.4, 0.07, "amber"], [2.3, 0.2, -1.0, 0.1, "amber"], [0.9, -1.5, 0.9, 0.08, "amber"]]
  .forEach(([x, y, z, r, mat], i) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 28), M[mat]);
    m.position.set(x, y, z); m.castShadow = mat === "chrome";
    m.userData = { base: new THREE.Vector3(x, y, z), ph: i * 1.7 };
    world.add(m); decor.push(m);
  });

/* ---------------- layout & camera ---------------- */
let spread = 1, camDist = 9.6;
const look = new THREE.Vector3();
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const mob = w <= 760;
  spread = mob ? 0.62 : 1;
  camDist = mob ? 13.5 : (w / h < 1.3 ? 11 : 9.6);
  camera.updateProjectionMatrix();
  const vh = 2 * camDist * Math.tan(THREE.MathUtils.degToRad(16)), vw = vh * camera.aspect;
  // keep the objects clear of the text card (card on the right on desktop, at the bottom on phones)
  world.position.set(mob ? 0 : -vw * 0.14, mob ? vh * 0.16 : 0, 0);
}
addEventListener("resize", resize);
resize();

const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", (e) => { pointer.tx = e.clientX / innerWidth - 0.5; pointer.ty = e.clientY / innerHeight - 0.5; }, { passive: true });

/* ---------------- choreography ---------------- */
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function update(p, t) {
  // camera: gentle dolly per chapter + pointer parallax
  pointer.x += (pointer.tx - pointer.x) * 0.05; pointer.y += (pointer.ty - pointer.y) * 0.05;
  const dz = camDist * (1 - 0.1 * Math.sin(seg(p, 0.15, 0.45) * Math.PI) + 0.06 * seg(p, 0.6, 0.95));
  const hi = ease(seg(p, 0.64, 0.84));
  camera.position.set(pointer.x * 0.8, lerp(0.35, 1.7, hi) - pointer.y * 0.5, dz);
  look.set(0, lerp(-0.2, -0.6, hi), 0); camera.lookAt(look);

  /* 1 · grinder + hovering bean */
  const gOut = ease(seg(p, 0.2, 0.36));
  grinder.position.y = -gOut * 4; grinder.visible = gOut < 1;
  grinder.rotation.y = t * 0.05;

  /* 2 · split */
  const s1 = ease(seg(p, 0.2, 0.36)), s2 = ease(seg(p, 0.38, 0.5));
  bean.visible = s2 < 1;
  bean.position.set(0, lerp(0.95 + Math.sin(t * 1.4) * 0.06, 0.45, s1) + s2 * 1.2, 0);
  bean.scale.setScalar(lerp(0.66, 1.15, s1) * (1 - s2 * 0.5));
  bean.rotation.set(lerp(0.12, 0.1, s1), Math.sin(t * 0.5) * 0.55 * (1 - s1) + lerp(-0.25, 0.25, s1), lerp(0.42, 0, s1));
  halves.forEach((h, i) => {
    const sg = i === 0 ? -1 : 1;
    h.position.x = sg * (s1 * 0.75 + s2 * 3.4 * spread);
    h.position.y = s1 * 0.08 * sg + s2 * 0.6;
    h.rotation.set(0, sg * (s1 * 0.95 + s2 * 0.8), sg * s1 * 0.25);
  });

  /* small beans: burst out, then rain into the glass */
  const burst = easeOut(seg(p, 0.21, 0.38)), rain = seg(p, 0.4, 0.6);
  for (let i = 0; i < N_BEANS; i++) {
    const b = B[i];
    let sc = b.s * (burst > 0 ? 1 : 0);
    tmp.set(0, 0.45, 0).addScaledVector(b.dir, burst);
    tmp.x *= spread; tmp.y += Math.sin(t * 0.8 + b.k * 6) * 0.05 * burst;
    const r = clamp((rain - b.k * 0.45) / 0.55);
    if (r > 0) {
      const e = ease(r), a = tmp.clone();
      const bx = b.jx * 0.9, bz = b.jz;
      const mid = tmp2.set(bx, G_TOP + 1.3, bz);
      const end = new THREE.Vector3(b.jx * 0.55, IN_BOT + 0.35 + b.k * 0.4, b.jz * 0.55);
      tmp.set(0, 0, 0).addScaledVector(a, (1 - e) * (1 - e)).addScaledVector(mid, 2 * (1 - e) * e).addScaledVector(end, e * e);
      sc *= r > 0.82 ? 1 - (r - 0.82) / 0.18 : 1;
    }
    dummy.position.copy(tmp);
    dummy.rotation.set(b.spin.x * (burst + rain + t * 0.15), b.spin.y * (burst + t * 0.12), b.spin.z * burst);
    dummy.scale.setScalar(Math.max(0, sc));
    dummy.updateMatrix(); beans.setMatrixAt(i, dummy.matrix);
  }
  beans.instanceMatrix.needsUpdate = true;
  beans.visible = burst > 0 && rain < 1;

  /* 3 · glass rises, fills, caramel wraps it */
  const gIn = ease(seg(p, 0.34, 0.46)), q = ease(seg(p, 0.66, 0.8)), gExit = ease(seg(p, 0.84, 0.92));
  glass.visible = gIn > 0 && gExit < 1;
  const fillIn = ease(seg(p, 0.46, 0.62)), drain = seg(q, 0.45, 1);
  setFill(fillIn * (1 - drain));
  liquidTop.rotation.z = t * 0.6;
  const rib = clamp(seg(p, 0.5, 0.64) - seg(p, 0.66, 0.72));
  ribbon.visible = rib > 0.001;
  ribbon.geometry.setDrawRange(0, Math.floor((RIB_COUNT * rib) / 6) * 6);
  ribbon.rotation.y = t * 0.25;

  /* 4 · pour into the cup */
  glass.position.set(lerp(0, 0.12, q) + gExit * 3.5, lerp(-4.5, 0, gIn) + lerp(0, 1.15, q) + gExit * 2.5, 0);
  glass.rotation.set(0, 0, lerp(0, 1.78, q));
  const cIn = ease(seg(p, 0.66, 0.76));
  cup.position.set(0, FLOOR + lerp(-4, 0, cIn), 0);
  cup.visible = cIn > 0;
  const cFill = ease(seg(p, 0.71, 0.85)), latte = ease(seg(p, 0.82, 0.9));
  const cy = lerp(0.16, 0.86, cFill), cr = lerp(0.43, 0.76, cFill);
  [cupDark, cupLatte].forEach((m) => { m.position.y = cy; m.scale.setScalar(cr); m.visible = cFill > 0.01; });
  cupLatte.position.y = cy + 0.002;
  cupLatte.material.opacity = latte;
  cupDark.rotation.z = -t * 0.5;
  // the stream runs from the glass lip to the coffee surface
  const pouring = q > 0.5 && drain < 0.98 && gExit < 0.05;
  stream.visible = pouring;
  if (pouring) {
    glass.updateMatrixWorld();
    const lip = glass.localToWorld(new THREE.Vector3(-0.72, G_TOP, 0));
    world.worldToLocal(lip);
    const surf = new THREE.Vector3(0, cup.position.y + cy, 0);
    const len = lip.distanceTo(surf);
    stream.position.copy(lip).add(surf).multiplyScalar(0.5);
    stream.quaternion.setFromUnitVectors(up, tmp.copy(lip).sub(surf).normalize());
    stream.scale.set(1 - drain * 0.6, len, 1 - drain * 0.6);
  }

  /* 5 · bags arrive */
  const bIn = easeOut(seg(p, 0.86, 0.97));
  bags.forEach((g, i) => {
    const sg = i === 0 ? -1 : 1;
    g.visible = bIn > 0;
    g.position.set(sg * (spread < 1 ? 1.35 : 1.85), lerp(-4, FLOOR + 0.78, bIn), lerp(0.5, spread < 1 ? -1.3 : -0.55, bIn));
    g.rotation.set(0, -sg * 0.42 + Math.sin(t * 0.6 + i) * 0.03, 0);
    g.scale.setScalar(spread < 1 ? 0.8 : 1);
  });

  decor.forEach((m) => {
    const d = m.userData;
    m.position.set(d.base.x * spread, d.base.y + Math.sin(t * 0.9 + d.ph) * 0.12, d.base.z);
  });
}

/* ---------------- loop ---------------- */
const clock = new THREE.Clock();
document.body.classList.add("gl");
window.__gl = true;
function frame() {
  requestAnimationFrame(frame);
  if (window.__past) { canvas.style.visibility = "hidden"; return; }
  canvas.style.visibility = "visible";
  update(window.__storyP || 0, clock.getElapsedTime());
  renderer.render(scene, camera);
}
frame();
