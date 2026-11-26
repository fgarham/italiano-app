import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type Mood = "sleeping" | "waking" | "idle" | "listening" | "thinking" | "talking" | "dozing";

/**
 * The teacher figure. Uses a procedural shaggy fur ball until a GLB model is
 * found at public/model/teacher.glb, then switches to that model.
 */
export class Avatar {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  private clock = new THREE.Clock();
  private rig: Rig;
  private mood: Mood = "sleeping";
  private moodTime = 0;
  private mouthTarget = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0.35, 6.2);
    this.camera.lookAt(0, 0.05, 0);

    this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x8a6f9e, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(2, 3, 4);
    this.scene.add(key);

    this.scene.add(makeShadow());
    this.rig = new FurBallRig();
    this.scene.add(this.rig.root);

    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.renderer.setAnimationLoop(() => this.tick());
    void this.tryLoadModel();
  }

  setMood(mood: Mood) {
    if (mood === this.mood) return;
    this.mood = mood;
    this.moodTime = 0;
  }

  getMood() {
    return this.mood;
  }

  /** 0..1 loudness of the current speech. */
  setMouth(v: number) {
    this.mouthTarget = v;
  }

  private async tryLoadModel() {
    const url = `${import.meta.env.BASE_URL}model/teacher.glb`;
    try {
      const head = await fetch(url, { method: "HEAD" });
      const type = head.headers.get("content-type") ?? "";
      if (!head.ok || type.includes("text/html")) return;
      const gltf = await new GLTFLoader().loadAsync(url);
      const rig = new GlbRig(gltf.scene, gltf.animations);
      this.scene.remove(this.rig.root);
      this.rig = rig;
      this.scene.add(rig.root);
    } catch (err) {
      console.info("Kein GLB-Modell gefunden, nutze das Fellknäuel.", err);
    }
  }

  private resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the figure fully visible on narrow phones
    this.camera.position.z = w / h < 0.8 ? 7.4 : 6.2;
    this.camera.updateProjectionMatrix();
  }

  private tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.moodTime += dt;
    this.rig.update(dt, this.clock.elapsedTime, this.mood, this.moodTime, this.mouthTarget);
    this.renderer.render(this.scene, this.camera);
  }
}

interface Rig {
  root: THREE.Object3D;
  update(dt: number, t: number, mood: Mood, moodTime: number, mouth: number): void;
}

function makeShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(60,30,70,0.35)");
  grad.addColorStop(1, "rgba(60,30,70,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.6),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = -1.12;
  return m;
}

const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));

/** Shared expression state so both rigs animate the same way. */
class Expression {
  eyeOpen = 0;
  mouth = 0;
  lookX = 0;
  lookY = 0;
  private blinkIn = 2;
  private blink = 0;
  private lookIn = 1;
  private lookTarget = new THREE.Vector2();

  update(dt: number, t: number, mood: Mood, moodTime: number, mouth: number) {
    // eyes
    let open = 1;
    if (mood === "sleeping") open = 0;
    else if (mood === "dozing") open = 0.25;
    else if (mood === "waking") {
      // flutter open: 0..1.8s
      open = moodTime < 0.6 ? 0.15 : moodTime < 0.8 ? 0.6 : moodTime < 0.95 ? 0.1 : Math.min(1, (moodTime - 0.95) * 2);
    } else if (mood === "listening") open = 1.12;
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && open > 0.5) {
      this.blink = 0.14;
      this.blinkIn = 2.5 + Math.random() * 3.5;
    }
    if (this.blink > 0) {
      this.blink -= dt;
      open = 0.05;
    }
    this.eyeOpen = damp(this.eyeOpen, open, mood === "sleeping" ? 3 : 18, dt);

    // gaze
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIn = 1.5 + Math.random() * 2.5;
      this.lookTarget.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3);
      if (mood === "talking" || mood === "listening") this.lookTarget.multiplyScalar(0.3);
    }
    let lx = this.lookTarget.x;
    let ly = this.lookTarget.y;
    if (mood === "thinking") {
      lx = 0.35 * Math.sin(t * 0.7);
      ly = 0.45;
    }
    this.lookX = damp(this.lookX, lx, 6, dt);
    this.lookY = damp(this.lookY, ly, 6, dt);

    const target = mood === "talking" ? mouth : mood === "waking" && moodTime > 1.0 && moodTime < 1.9 ? 0.9 : 0; // yawn
    this.mouth = damp(this.mouth, target, 22, dt);
  }
}

/** Body motion shared by both rigs: breathing, bobbing, stretch on waking. */
function bodyMotion(root: THREE.Object3D, t: number, mood: Mood, moodTime: number, mouth: number, base: number) {
  const sleepy = mood === "sleeping" || mood === "dozing";
  const breath = Math.sin(t * (sleepy ? 1.3 : 2.2)) * (sleepy ? 0.035 : 0.018);
  let sy = 1 + breath;
  let sx = 1 - breath * 0.5;
  let y = 0;
  let tilt = 0;
  let lean = 0;
  if (mood === "waking") {
    const s = Math.sin(Math.min(moodTime / 1.6, 1) * Math.PI);
    sy += s * 0.12;
    sx -= s * 0.06;
    if (moodTime > 1.7 && moodTime < 2.2) y = Math.sin(((moodTime - 1.7) / 0.5) * Math.PI) * 0.25; // happy hop
  } else if (sleepy) {
    tilt = 0.12;
    lean = 0.08;
  } else {
    y = Math.sin(t * 1.6) * 0.03;
    tilt = Math.sin(t * 0.8) * 0.04;
    if (mood === "listening") {
      lean = -0.12;
      tilt = 0.14;
    }
    if (mood === "talking") {
      y += mouth * 0.05;
      tilt += Math.sin(t * 3.1) * 0.03 * mouth;
    }
  }
  root.position.y = y;
  root.scale.set(base * sx, base * sy, base * sx);
  root.rotation.z = damp(root.rotation.z, tilt, 4, 1 / 60);
  root.rotation.x = damp(root.rotation.x, lean, 4, 1 / 60);
}

/* ------------------------------------------------------------------ */
/* Procedural shaggy fur ball (shell fur)                              */
/* ------------------------------------------------------------------ */

const SHELLS = 30;

function makeNoiseTexture() {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  // low-frequency value noise for clumps / colour variation
  const grid = 16;
  const lattice = Array.from({ length: (grid + 1) * (grid + 1) }, () => Math.random());
  const lerp = (a: number, b: number, t: number) => a + (b - a) * (t * t * (3 - 2 * t));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * grid;
      const gy = (y / size) * grid;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const at = (i: number, j: number) => lattice[(j % grid) * (grid + 1) + (i % grid)];
      const v = lerp(lerp(at(ix, iy), at(ix + 1, iy), fx), lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
      const i = (y * size + x) * 4;
      data[i] = Math.random() * 255; // strand height
      data[i + 1] = v * 255; // clump
      data[i + 2] = Math.random() * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

const furVertex = /* glsl */ `
uniform float uLayer;
uniform float uLen;
uniform float uTime;
uniform float uSway;
uniform sampler2D uNoise;
varying vec2 vUv;
varying vec3 vNormal;
varying float vFace;
varying float vClump;
void main() {
  vec3 n = normalize(normal);
  float face = smoothstep(0.62, 0.86, dot(n, normalize(vec3(0.0, 0.05, 1.0))));
  float crown = smoothstep(0.55, 1.0, n.y);
  float clump = texture2D(uNoise, uv * vec2(3.0, 1.5)).g;
  float len = uLen * mix(1.0, 0.12, face) * (1.0 + 0.9 * crown) * mix(0.65, 1.35, clump);
  float k = uLayer * uLayer;
  vec3 p = position + n * len * uLayer;
  p.y -= k * len * (0.9 + crown) * mix(0.35, 1.0, smoothstep(-0.9, 0.2, n.y)); // shaggy droop, less under the belly
  p.x += sin(uTime * 1.7 + position.y * 5.0) * 0.012 * k * uSway;
  p.z += cos(uTime * 1.3 + position.x * 4.0) * 0.008 * k * uSway;
  vUv = uv;
  vFace = face;
  vClump = clump;
  vNormal = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const furFragment = /* glsl */ `
uniform float uLayer;
uniform sampler2D uNoise;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
varying vec3 vNormal;
varying float vFace;
varying float vClump;
void main() {
  vec4 nz = texture2D(uNoise, vUv * vec2(64.0, 32.0));
  float strand = nz.r * mix(0.55, 1.0, vClump);
  if (uLayer > 0.0 && strand < uLayer) discard;
  vec3 col = mix(uColorA, uColorB, vClump * 0.8 + nz.b * 0.2);
  col = mix(col, uColorB * 1.15, vFace * 0.5);
  float light = 0.55 + 0.45 * max(dot(normalize(vNormal), normalize(vec3(0.4, 0.7, 0.6))), 0.0);
  float ao = mix(0.42, 1.08, uLayer);
  float rim = pow(1.0 - max(vNormal.z, 0.0), 2.0) * 0.25 * uLayer;
  gl_FragColor = vec4(col * light * ao + rim, 1.0);
}`;

class FurBallRig implements Rig {
  root = new THREE.Group();
  private body = new THREE.Group();
  private shells: THREE.ShaderMaterial[] = [];
  private eyes: THREE.Group[] = [];
  private eyeWhites: THREE.MeshStandardMaterial[] = [];
  private pupils: THREE.Object3D[] = [];
  private mouth: THREE.Object3D;
  private expr = new Expression();

  constructor() {
    this.root.add(this.body);
    const noise = makeNoiseTexture();
    const geo = new THREE.SphereGeometry(1, 96, 64);
    for (let i = 0; i < SHELLS; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: furVertex,
        fragmentShader: furFragment,
        uniforms: {
          uLayer: { value: i / (SHELLS - 1) },
          uLen: { value: 0.26 },
          uTime: { value: 0 },
          uSway: { value: 1 },
          uNoise: { value: noise },
          uColorA: { value: new THREE.Color("#8a5cc4") },
          uColorB: { value: new THREE.Color("#c9a3f0") },
        },
      });
      this.shells.push(mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = i;
      this.body.add(mesh);
    }

    // face
    const white = () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1020, roughness: 0.2 });
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.34, 0.24, 0.93);
      const whiteMat = white();
      this.eyeWhites.push(whiteMat);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), whiteMat);
      ball.scale.z = 0.6;
      eye.add(ball);
      const pupil = new THREE.Group();
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), black);
      p.scale.z = 0.5;
      pupil.add(p);
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      glint.position.set(0.04, 0.045, 0.05);
      pupil.add(glint);
      pupil.position.z = 0.1;
      eye.add(pupil);
      this.pupils.push(pupil);
      this.eyes.push(eye);
      this.body.add(eye);
    }
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x6b2d5c, roughness: 0.35 }),
    );
    nose.position.set(0, 0.04, 1.08);
    this.body.add(nose);

    const mouth = new THREE.Group();
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ color: 0x3a0f2a }));
    mouth.add(inner);
    const tongue = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ color: 0xe8657f }));
    tongue.position.set(0, -0.07, 0.002);
    tongue.scale.y = 0.6;
    mouth.add(tongue);
    mouth.position.set(0, -0.2, 1.03);
    mouth.rotation.x = -0.2;
    this.mouth = mouth;
    this.body.add(mouth);

    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff8fb1, transparent: true, opacity: 0.45 });
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), cheekMat);
      cheek.position.set(side * 0.55, -0.05, 0.86);
      cheek.lookAt(side * 1.4, -0.1, 2.4);
      this.body.add(cheek);
    }

    // feet
    const footMat = new THREE.MeshStandardMaterial({ color: 0x6d3fa3, roughness: 0.9 });
    for (const side of [-1, 1]) {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), footMat);
      foot.scale.set(1.2, 0.55, 1.5);
      foot.position.set(side * 0.42, -1.02, 0.35);
      this.root.add(foot);
    }

    this.body.add(makeScarf());
    this.root.scale.setScalar(0.95);
  }

  update(dt: number, t: number, mood: Mood, moodTime: number, mouth: number) {
    this.expr.update(dt, t, mood, moodTime, mouth);
    bodyMotion(this.body, t, mood, moodTime, this.expr.mouth, 1);
    for (const s of this.shells) {
      s.uniforms.uTime.value = t;
      s.uniforms.uSway.value = mood === "talking" ? 1.8 : 1;
    }
    const open = this.expr.eyeOpen;
    this.eyes.forEach((eye, i) => {
      eye.scale.y = Math.max(0.06, open);
      this.eyeWhites[i].color.setRGB(1, 1, 1).lerp(new THREE.Color(0x3b1d52), 1 - Math.min(1, open * 1.6));
      this.pupils[i].visible = open > 0.3;
      this.pupils[i].position.x = this.expr.lookX * 0.09;
      this.pupils[i].position.y = this.expr.lookY * 0.08;
    });
    const m = this.expr.mouth;
    this.mouth.scale.set(0.9 + m * 0.25, 0.12 + m * 0.95, 1);
  }
}

function makeScarf() {
  const geo = new THREE.TorusGeometry(0.88, 0.1, 16, 96);
  const colors: number[] = [];
  const pos = geo.attributes.position;
  const green = new THREE.Color("#2f9e55");
  const whiteC = new THREE.Color("#f7f3ea");
  const red = new THREE.Color("#d8413a");
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    const band = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 18) % 3;
    const c = band === 0 ? green : band === 1 ? whiteC : red;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const scarf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  scarf.rotation.x = Math.PI / 2 + 0.12;
  scarf.position.y = -0.5;
  scarf.scale.set(1.06, 1.06, 1);
  return scarf;
}

/* ------------------------------------------------------------------ */
/* GLB model (e.g. the Sketchfab figure)                               */
/* ------------------------------------------------------------------ */

class GlbRig implements Rig {
  root = new THREE.Group();
  private inner: THREE.Object3D;
  private mixer?: THREE.AnimationMixer;
  private mouthMorphs: { mesh: THREE.Mesh; index: number }[] = [];
  private blinkMorphs: { mesh: THREE.Mesh; index: number }[] = [];
  private jaw?: THREE.Bone;
  private jawRest = 0;
  private expr = new Expression();
  private base = 1;

  constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    // normalise size: fit into ~2.2 units high, feet on the floor
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = 2.2 / Math.max(size.y, size.x * 0.8);
    model.position.sub(center).multiplyScalar(scale);
    model.scale.multiplyScalar(scale);
    model.position.y += 0.0;
    this.inner = new THREE.Group();
    this.inner.add(model);
    this.inner.position.y = -0.0;
    this.root.add(this.inner);

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary) {
        for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
          if (/mouth.?open|jaw.?open|viseme_aa|^aa$|mouth_a|^a$|open/i.test(name)) this.mouthMorphs.push({ mesh, index });
          if (/blink|eyes?.?clos/i.test(name)) this.blinkMorphs.push({ mesh, index });
        }
      }
      const bone = o as THREE.Bone;
      if (bone.isBone && !this.jaw && /jaw|mouth|chin/i.test(bone.name)) {
        this.jaw = bone;
        this.jawRest = bone.rotation.x;
      }
    });

    if (clips.length) {
      this.mixer = new THREE.AnimationMixer(model);
      const idle = clips.find((c) => /idle|breath|stand/i.test(c.name)) ?? clips[0];
      this.mixer.clipAction(idle).play();
    }
  }

  update(dt: number, t: number, mood: Mood, moodTime: number, mouth: number) {
    this.mixer?.update(dt);
    this.expr.update(dt, t, mood, moodTime, mouth);
    bodyMotion(this.inner, t, mood, moodTime, this.expr.mouth, this.base);
    const m = this.expr.mouth;
    for (const { mesh, index } of this.mouthMorphs) mesh.morphTargetInfluences![index] = m;
    for (const { mesh, index } of this.blinkMorphs) mesh.morphTargetInfluences![index] = 1 - Math.min(1, this.expr.eyeOpen);
    if (this.jaw) this.jaw.rotation.x = this.jawRest + m * 0.35;
    if (!this.mouthMorphs.length && !this.jaw && mood === "talking") {
      // no mouth controls: let the whole figure "speak" with a little squash
      this.inner.scale.y *= 1 + m * 0.04;
    }
  }
}
