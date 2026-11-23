/* 3D scene: the floating astronaut in the hero and the planet above the footer.
   Loaded on demand (after the intro) and only when the browser can handle it.
   If anything fails, the static astronaut photo simply stays in place. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const doc = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const MODEL_URL = new URL('../models/astronaut.glb.gz', import.meta.url).href;

/* ---------- shared helpers ---------- */
function makeRenderer(canvas, maxDpr) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  r.setClearColor(0x000000, 0);
  return r;
}
function whenVisible(el, cb, margin = '0px') {
  const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { rootMargin: margin });
  io.observe(el);
}
function loop(render, isActive, fps = 60) {
  let last = 0, raf = 0;
  const step = now => {
    raf = requestAnimationFrame(step);
    if (!isActive() || now - last < 1000 / fps - 2) return;
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    render(dt, now / 1000);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* ======================================================================
   ASTRONAUT
   ====================================================================== */
export async function startAstronaut(stage, canvas) {
  const renderer = makeRenderer(canvas, coarse ? 1.75 : 2);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);

  // soft, low-contrast studio light: no reflections, so the suit and visor stay matte like the original photo
  scene.add(new THREE.HemisphereLight(0xeaf0ff, 0x2b3050, 1.25));
  const key = new THREE.DirectionalLight(0xf0f5ff, 1.15); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0x3a5bff, 0.9); rim.position.set(4, 2, -4); scene.add(rim);

  // a tiny "night sky" used only for reflections: scattered stars and a faint blue glow (the visor mirrors them)
  const sky = new THREE.Scene(); sky.background = new THREE.Color(0x000000);
  const starMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(90) });
  const starGeo = new THREE.SphereGeometry(0.16, 6, 4);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 170; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    const m = new THREE.Mesh(starGeo, starMat); m.position.set(r * Math.cos(a), u, r * Math.sin(a)).multiplyScalar(10);
    m.scale.setScalar(0.5 + rnd() * 1.1); sky.add(m);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2f52ff).multiplyScalar(0.5), side: THREE.DoubleSide });
  const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), glowMat); glowPlane.position.set(5, -7, 5); glowPlane.lookAt(0, 0, 0); sky.add(glowPlane);
  const pm = new THREE.PMREMGenerator(renderer);
  const skyEnv = pm.fromScene(sky, 0, 0.1, 50, { size: 512 }).texture;
  pm.dispose();

  // load the (gzip-compressed) model
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error('model ' + res.status);
  if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
  const buf = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  const gltf = await new Promise((ok, no) => new GLTFLoader().parse(buf, '', ok, no));

  const root = new THREE.Group(); root.add(gltf.scene); scene.add(root);
  let head = null;
  gltf.scene.traverse(o => {
    if (o.isMesh || o.isSkinnedMesh) {
      o.frustumCulled = false;
      const m = o.material;
      if (m && !m.userData.done) {   // matte suit; only the near-black visor is glossy so it mirrors the stars
        m.metalness = 0; m.metalnessMap = null; m.roughness = 1; m.roughnessMap = null;
        if (m.normalScale) m.normalScale.set(0.55, 0.55);
        if (m.map) {
          m.color.set(0xb4bccb);   // cancels the texture's warm cast
          const img = m.map.image, n = 512, c = document.createElement('canvas'); c.width = c.height = n;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
          const d = g.getImageData(0, 0, n, n), px = d.data;
          for (let i = 0; i < px.length; i += 4) {
            const lum = (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) / 255;
            const t = Math.min(Math.max((lum - 0.05) / 0.09, 0), 1);          // 0 = black visor, 1 = everything else
            px[i] = 255; px[i + 1] = Math.round(255 * (0.05 + 0.95 * t)); px[i + 2] = 0; px[i + 3] = 255;   // g = roughness, b = metal
          }
          g.putImageData(d, 0, 0);
          const tex = new THREE.CanvasTexture(c); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
          m.roughnessMap = tex; m.envMap = skyEnv; m.envMapIntensity = 1.2;
        }
        m.userData.done = true; m.needsUpdate = true;
      }
    }
    if (o.isBone && /^head\d*$/i.test(o.name)) head = o;
  });
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations[0];
  if (clip) mixer.clipAction(clip).play();

  // framing: measure the real animated bounds (the float lifts the body), then centre the model on its own middle
  const FRAME = { cy: 1.2, h: 3.0, w: 2.4 };
  if (clip) {
    const act = mixer.clipAction(clip), box = new THREE.Box3(), one = new THREE.Box3();
    for (let t = 0; t < clip.duration; t += clip.duration / 12) {
      mixer.setTime(t); gltf.scene.updateMatrixWorld(true);
      one.makeEmpty().expandByObject(gltf.scene, true); box.union(one);
    }
    mixer.setTime(0); act.time = 0;
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    gltf.scene.position.x -= c.x; gltf.scene.position.z -= c.z;
    FRAME.cy = c.y; FRAME.h = sz.y * 1.16; FRAME.w = Math.max(sz.x * 1.2, 1.2);
  }
  function fit() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vf = THREE.MathUtils.degToRad(camera.fov);
    const distH = (FRAME.h / 2) / Math.tan(vf / 2);
    const distW = (FRAME.w / 2) / (Math.tan(vf / 2) * camera.aspect);
    const d = Math.max(distH, distW);
    camera.position.set(0, FRAME.cy, d); camera.lookAt(0, FRAME.cy, 0);
    camera.updateProjectionMatrix();
  }
  fit(); new ResizeObserver(fit).observe(stage);

  // pointer: desktop follows the cursor, phones follow a finger and otherwise drift on their own
  const tgt = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  let lastMove = -1e9;
  addEventListener('pointermove', e => {
    tgt.x = (e.clientX / innerWidth) * 2 - 1; tgt.y = (e.clientY / innerHeight) * 2 - 1; lastMove = performance.now();
  }, { passive: true });
  addEventListener('pointerdown', e => {
    tgt.x = (e.clientX / innerWidth) * 2 - 1; tgt.y = (e.clientY / innerHeight) * 2 - 1; lastMove = performance.now();
  }, { passive: true });

  let onScreen = true;
  whenVisible(stage, v => (onScreen = v), '100px');
  const active = () => onScreen && !document.hidden;
  const hd = new THREE.Euler(), hq = new THREE.Quaternion();

  loop((dt, t) => {
    // idle sway keeps it alive on phones and when the cursor is still
    const idle = performance.now() - lastMove > (coarse ? 1200 : 2500);
    const ix = Math.sin(t * 0.45) * 0.5, iy = Math.sin(t * 0.33 + 1) * 0.25;
    const tx = idle ? ix : tgt.x, ty = idle ? iy : tgt.y;
    const k = 1 - Math.exp(-dt * 3.2);
    cur.x += (tx - cur.x) * k; cur.y += (ty - cur.y) * k;
    root.rotation.y = cur.x * 0.55;
    root.rotation.x = cur.y * 0.16;
    root.position.x = cur.x * 0.08;
    mixer.update(dt);
    if (head) { hd.set(0, 0, 0); head.quaternion.multiply(hq.setFromEuler(hd.set(cur.y * 0.25, cur.x * 0.35, 0))); }
    renderer.render(scene, camera);
  }, active, coarse ? 45 : 60);

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stage.classList.remove('has-3d'); });
  stage.classList.add('has-3d');
}

/* ======================================================================
   PLANET (real NASA Blue Marble imagery: day, night lights, clouds/roughness/relief)
   ====================================================================== */
const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FS = `
precision highp float;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
uniform sampler2D uDay, uNight, uData; uniform float uTime; uniform vec3 uSun;
void main(){
  vec3 N0 = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 data = texture2D(uData, vUv).rgb;            // r relief, g roughness (ocean = low), b clouds
  vec3 N = N0;
  vec3 day = texture2D(uDay, vUv).rgb;
  vec3 night = texture2D(uNight, vUv).rgb;
  float ocean = 1.0 - smoothstep(0.30, 0.55, data.g);
  // clouds drift slightly faster than the ground and cast a soft shadow
  vec2 cuv = vUv + vec2(uTime * 0.0006, 0.0);
  float clouds = texture2D(uData, cuv).b;
  float shadow = texture2D(uData, cuv - vec2(uSun.x, -uSun.y) * 0.004).b;
  clouds = smoothstep(0.22, 0.95, clouds);
  float ndl = dot(N, uSun);
  float ndlG = dot(N0, uSun);
  float lit = smoothstep(-0.10, 0.22, ndlG);
  float diff = max(ndl, 0.0);
  vec3 surf = day * (1.0 - 0.45 * smoothstep(0.2, 0.9, shadow) * (1.0 - clouds));
  // soft, slightly warm sunlight; a little ambient so the dark side is not pitch black
  vec3 col = surf * (0.04 + diff * 1.55) * vec3(1.0, 0.98, 0.94);
  // ocean sun glint
  vec3 R = reflect(-uSun, N);
  float spec = pow(max(dot(R, V), 0.0), 55.0) * ocean * lit;
  col += vec3(1.0, 0.95, 0.85) * spec * 0.65;
  // clouds on top
  vec3 cloudCol = vec3(1.0) * (0.045 + max(ndlG, 0.0) * 1.12);
  col = mix(col, cloudCol, clouds * 0.85);
  // city lights on the night side, hidden under cloud
  float nightSide = 1.0 - smoothstep(-0.18, 0.10, ndlG);
  col += night * vec3(1.05, 0.80, 0.50) * nightSide * (1.0 - clouds * 0.85) * 1.15;
  // atmospheric haze toward the limb (blue by day, warm near the terminator)
  float fr = pow(1.0 - max(dot(N0, V), 0.0), 2.6);
  vec3 haze = mix(vec3(0.07, 0.28, 0.95), vec3(1.0, 0.45, 0.18), (1.0 - smoothstep(0.0, 0.35, ndlG)) * smoothstep(-0.2, 0.0, ndlG) * 0.8);
  col += haze * fr * (0.06 + 0.55 * lit);
  gl_FragColor = vec4(col, 1.0);
}`;
const ATMO_VS = `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix)*normal); vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const ATMO_FS = `varying vec3 vN; varying vec3 vW; uniform vec3 uSun;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  float i = pow(max(0.5 - dot(vN, V), 0.0), 2.2);
  float sunSide = smoothstep(-0.35, 0.55, dot(normalize(vN), uSun));
  vec3 c = mix(vec3(0.08, 0.30, 1.0), vec3(0.45, 0.72, 1.0), sunSide * 0.5);
  gl_FragColor = vec4(c * i * 1.6 * (0.2 + sunSide), i * (0.25 + sunSide));
}`;

export function startEarth(wrap, canvas) {
  const renderer = makeRenderer(canvas, coarse ? 1.5 : 1.75);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const sun = new THREE.Vector3(-0.62, 0.34, 0.70).normalize();
  const uniforms = { uTime: { value: 0 }, uSun: { value: sun }, uDay: { value: null }, uNight: { value: null }, uData: { value: null } };
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: EARTH_FS, uniforms }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.03, 96, 64), new THREE.ShaderMaterial({ vertexShader: ATMO_VS, fragmentShader: ATMO_FS, uniforms: { uSun: { value: sun } }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const tilt = new THREE.Group(); tilt.add(planet); tilt.rotation.x = 0.8; tilt.rotation.z = -0.12;
  planet.rotation.y = -1.9;                    // start with Europe and Africa facing us
  const sys = new THREE.Group(); sys.add(tilt, atmo); scene.add(sys);

  // keep a constant slice of the horizon on every screen size
  function fit() {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect; camera.position.set(0, 0, 4); camera.lookAt(0, 0, 0);
    const halfW = 0.66;   // same slice of the horizon on every screen
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((halfW / aspect) / 4));
    camera.updateProjectionMatrix();
    const topOfView = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 4;   // world y at the top edge
    sys.position.y = topOfView * 0.72 - 1;                                     // top of the planet sits ~14% down the canvas
  }
  fit(); new ResizeObserver(fit).observe(wrap);

  // load the three images only when the section is close to the screen
  const base = new URL('../img/earth/', import.meta.url).href;
  let onScreen = false, loading = false, ready = false;
  function loadTextures() {
    if (loading) return; loading = true;
    const loader = new THREE.TextureLoader();
    const get = f => new Promise((res, rej) => loader.load(base + f, t => {
      t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      t.wrapS = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; res(t);
    }, undefined, rej));
    Promise.all([get('earth_day_4096.jpg'), get('earth_night_4096.jpg'), get('earth_bump_roughness_clouds_4096.jpg')])
      .then(([d, n, x]) => { uniforms.uDay.value = d; uniforms.uNight.value = n; uniforms.uData.value = x; ready = true; })
      .catch(err => console.warn('earth textures', err));
  }
  whenVisible(wrap, v => { onScreen = v; if (v) loadTextures(); }, '900px');

  let first = true;
  loop((dt, t) => {
    if (!ready) return;
    uniforms.uTime.value = t;
    if (!reduce) planet.rotation.y += dt * 0.02;
    renderer.render(scene, camera);
    if (first) { first = false; wrap.classList.add('has-3d'); }
  }, () => (onScreen && !document.hidden) || (ready && first), 30);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); wrap.classList.remove('has-3d'); });
}

/* ---------- entry point ---------- */
export function start() {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
  const stage = document.getElementById('stage'), astro = document.getElementById('astro');
  const earth = document.getElementById('earth'), ec = document.getElementById('earth-canvas');
  if (earth && ec) { try { startEarth(earth, ec); } catch (err) { console.warn('earth', err); } }
  if (stage && astro && !reduce) startAstronaut(stage, astro).catch(err => console.warn('astronaut', err));
}
