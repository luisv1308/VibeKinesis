import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as CANNON from 'cannon-es';

const PLAYER_EYE_HEIGHT = 1.65;
const MOVE_SPEED = 12;
const GRAB_REACH = 40;
const PULL_GAIN = 10;
const PULL_MAX_SPEED = 28;
const LAUNCH_SPEED = 42;

const DRONE_RADIUS = 0.38;
const DRONE_MASS = 0.55;
/** Velocidad máxima tipo “zombie” (unidades/s). */
const DRONE_MAX_SPEED = 3.6;
/** Qué tan rápido corrigen hacia esa velocidad (bajo = más lentos y estables). */
const DRONE_STEER_STRENGTH = 3.2;
/** Tope de fuerza por frame para evitar tirones. */
const DRONE_MAX_FORCE = 9;
const SPAWN_INTERVAL = 5;
/** Anillo de aparición alrededor del jugador: radio interior / exterior. */
const SPAWN_RING_INNER = 22;
const SPAWN_RING_OUTER = 36;
/** Cada dron persigue un punto cerca del jugador, no el mismo centro (evita amontonarse). */
const DRONE_PERSONAL_OFFSET_RANGE = 2.2;
const CUBE_KILL_DRONE_SPEED = 16;
const DRONE_DEATH_SHRINK_SPEED = 7;
const DRONE_FLASH_SEC = 0.12;
const MAX_DRONES = 36;

const HAND_SIZE_PX = 292;
/** Mano derecha en FP: fracción del ancho a la derecha del centro (0 = centro). */
const HAND_ANCHOR_X_FRAC = 0.1;
/** Fracción del alto: negativo = por debajo del centro. Más negativo = más abajo (apoyada, no “flotando”). */
const HAND_ANCHOR_Y_FRAC = -0.4;
const HAND_EXTENDED_MS = 200;
const HAND_KICK_X = 14;
const HAND_KICK_Y = 18;

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -28, 0) });
world.allowSleep = true;
world.broadphase = new CANNON.SAPBroadphase(world);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0c14);
scene.fog = new THREE.Fog(0x0c0c14, 25, 90);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, PLAYER_EYE_HEIGHT, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
{
  const el = renderer.domElement;
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.zIndex = '0';
  el.style.display = 'block';
}

const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.24,
  0.5,
  0.58
);
composer.addPass(bloomPass);

const sceneHUD = new THREE.Scene();
const hudCamera = new THREE.OrthographicCamera(
  -window.innerWidth / 2,
  window.innerWidth / 2,
  window.innerHeight / 2,
  -window.innerHeight / 2,
  0.1,
  20
);
hudCamera.position.z = 10;

function makeCrosshairTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(16, 16, 4.5, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const crosshairTex = makeCrosshairTexture();
const crosshairMat = new THREE.SpriteMaterial({
  map: crosshairTex,
  color: 0xffffff,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  sizeAttenuation: false,
});
const crosshairSprite = new THREE.Sprite(crosshairMat);
crosshairSprite.scale.set(18, 18, 1);
crosshairSprite.position.set(0, 0, 0);
crosshairSprite.renderOrder = 10;
sceneHUD.add(crosshairSprite);

const textureLoader = new THREE.TextureLoader();
const assetBase = import.meta.env.BASE_URL || '/';

function makeHandPlaceholderTexture(label) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = '#00fff4';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(128, 128, 88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = 'bold 26px system-ui,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(label, 128, 128);
  ctx.fillStyle = '#e8f4ff';
  ctx.fillText(label, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let texHandOpen = makeHandPlaceholderTexture('OPEN');
let texHandClose = makeHandPlaceholderTexture('CLOSE');
let texHandExtended = makeHandPlaceholderTexture('PUSH');
let lastHandVisual = 'open';

function syncHandMaterialMap() {
  if (lastHandVisual === 'open') handMat.map = texHandOpen;
  else if (lastHandVisual === 'close') handMat.map = texHandClose;
  else handMat.map = texHandExtended;
  handMat.needsUpdate = true;
}

function loadHandPng(url, onTex) {
  textureLoader.load(
    url,
    (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      onTex(t);
      syncHandMaterialMap();
    },
    undefined,
    () => {}
  );
}

loadHandPng(`${assetBase}single_hand_open.png`, (t) => {
  texHandOpen = t;
});
loadHandPng(`${assetBase}single_hand_close.png`, (t) => {
  texHandClose = t;
});
loadHandPng(`${assetBase}original_hand_extended.png`, (t) => {
  texHandExtended = t;
});

const handMat = new THREE.SpriteMaterial({
  map: texHandOpen,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  sizeAttenuation: false,
  alphaTest: 0.01,
});
const handSprite = new THREE.Sprite(handMat);
handSprite.scale.set(HAND_SIZE_PX, HAND_SIZE_PX, 1);
handSprite.renderOrder = 5;
sceneHUD.add(handSprite);

let handBaseX = 0;
let handBaseY = 0;
let handShakeX = 0;
let handShakeY = 0;
let handExtendedUntil = 0;

function updateHudLayout() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  hudCamera.left = -w / 2;
  hudCamera.right = w / 2;
  hudCamera.top = h / 2;
  hudCamera.bottom = -h / 2;
  hudCamera.updateProjectionMatrix();

  handBaseX = w * HAND_ANCHOR_X_FRAC;
  handBaseY = h * HAND_ANCHOR_Y_FRAC;
  handSprite.position.set(handBaseX + handShakeX, handBaseY + handShakeY, 0);
}

updateHudLayout();

const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker');

document.addEventListener('click', () => {
  if (!controls.isLocked) {
    controls.lock();
  }
});

controls.addEventListener('lock', () => {
  blocker.classList.add('hidden');
});

controls.addEventListener('unlock', () => {
  blocker.classList.remove('hidden');
  if (grabbedBody) {
    const mesh = cubeMeshFromBody(grabbedBody);
    if (mesh) clearGrabTransparency(mesh);
    grabbedBody = null;
  }
});

const ambient = new THREE.AmbientLight(0x6a7090, 0.45);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff4e8, 1.05);
sun.position.set(14, 28, 10);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.camera.near = 2;
sun.shadow.camera.far = 80;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

const groundGeo = new THREE.PlaneGeometry(120, 120);
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x1e2430,
  roughness: 0.92,
  metalness: 0.05,
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const cubeMeshes = [];
const raycaster = new THREE.Raycaster();
const ndcCenter = new THREE.Vector2(0, 0);

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const boxColors = [0x5b8cff, 0xff6b6b, 0x51cf66, 0xffd43b, 0xcc5de8, 0x22b8cf];

function addCube(x, y, z, color) {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.45,
    metalness: 0.15,
  });
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
  const body = new CANNON.Body({
    mass: 1.2,
    linearDamping: 0.08,
    angularDamping: 0.2,
    position: new CANNON.Vec3(x, y, z),
  });
  body.addShape(shape);
  world.addBody(body);

  mesh.userData.body = body;
  mesh.userData.isGrabbable = true;
  body.userData = { isCube: true };
  cubeMeshes.push(mesh);
}

const cubePositions = [
  [-4, 2.5, -2],
  [2, 1.5, -5],
  [-1, 3, 4],
  [6, 2, 1],
  [-7, 1.2, 5],
  [0, 4, -8],
  [4, 2.5, -10],
  [-3, 1.8, -12],
];

cubePositions.forEach((p, i) => addCube(p[0], p[1], p[2], boxColors[i % boxColors.length]));

const droneGeo = new THREE.SphereGeometry(DRONE_RADIUS, 20, 20);
const drones = [];

function randomSpawnPointAroundPlayer() {
  const angle = Math.random() * Math.PI * 2;
  const dist =
    SPAWN_RING_INNER +
    Math.random() * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
  let x = camera.position.x + Math.cos(angle) * dist;
  let z = camera.position.z + Math.sin(angle) * dist;
  const y = 0.9 + Math.random() * 5;
  const half = 56;
  x = THREE.MathUtils.clamp(x, -half, half);
  z = THREE.MathUtils.clamp(z, -half, half);
  return { x, y, z };
}

function randomPersonalOffset() {
  return {
    x: (Math.random() - 0.5) * 2 * DRONE_PERSONAL_OFFSET_RANGE,
    y: (Math.random() - 0.5) * 0.9,
    z: (Math.random() - 0.5) * 2 * DRONE_PERSONAL_OFFSET_RANGE,
  };
}

function createDrone(x, y, z) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x4a4a55,
    metalness: 0.9,
    roughness: 0.22,
    emissive: 0xff0505,
    emissiveIntensity: 1.35,
  });
  const mesh = new THREE.Mesh(droneGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  scene.add(mesh);

  const shape = new CANNON.Sphere(DRONE_RADIUS);
  const body = new CANNON.Body({
    mass: DRONE_MASS,
    linearDamping: 0.58,
    angularDamping: 0.82,
    position: new CANNON.Vec3(x, y, z),
  });
  body.addShape(shape);
  world.addBody(body);

  const drone = {
    mesh,
    body,
    dying: false,
    deathPhase: 0,
    personalOffset: randomPersonalOffset(),
  };

  body.addEventListener('collide', (e) => {
    if (drone.dying) return;
    const other = e.body;
    const hitCube = cubeMeshes.some((m) => m.userData.body === other);
    if (!hitCube) return;
    if (other.velocity.length() < CUBE_KILL_DRONE_SPEED) return;
    killDrone(drone);
  });

  drones.push(drone);
  return drone;
}

function killDrone(drone) {
  if (drone.dying) return;
  drone.dying = true;
  drone.deathPhase = 0;
  world.removeBody(drone.body);
  drone.mesh.material.emissive.setHex(0xff6666);
  drone.mesh.material.emissiveIntensity = 5;
  drone.mesh.material.color.setHex(0xffffff);
}

const _droneToPlayer = new CANNON.Vec3();
const _droneForce = new CANNON.Vec3();

function updateDronesAI(dt) {
  for (const d of drones) {
    if (d.dying) continue;
    const b = d.body;
    const ox = d.personalOffset.x;
    const oy = d.personalOffset.y;
    const oz = d.personalOffset.z;
    const tx = camera.position.x + ox;
    const ty = camera.position.y + oy;
    const tz = camera.position.z + oz;
    _droneToPlayer.set(tx - b.position.x, ty - b.position.y, tz - b.position.z);
    const dist = _droneToPlayer.length();
    if (dist < 0.15) continue;
    _droneToPlayer.scale(1 / dist, _droneToPlayer);
    const vx = b.velocity.x;
    const vy = b.velocity.y;
    const vz = b.velocity.z;
    const k = b.mass * DRONE_STEER_STRENGTH * dt;
    _droneForce.set(
      (_droneToPlayer.x * DRONE_MAX_SPEED - vx) * k,
      (_droneToPlayer.y * DRONE_MAX_SPEED - vy) * k,
      (_droneToPlayer.z * DRONE_MAX_SPEED - vz) * k
    );
    const fLen = _droneForce.length();
    if (fLen > DRONE_MAX_FORCE) {
      _droneForce.scale(DRONE_MAX_FORCE / fLen, _droneForce);
    }
    b.applyForce(_droneForce, b.position);
  }
}

function updateDronesDeath(dt) {
  for (let i = drones.length - 1; i >= 0; i--) {
    const d = drones[i];
    if (!d.dying) continue;
    d.deathPhase += dt;
    if (d.deathPhase < DRONE_FLASH_SEC) {
      const t = d.deathPhase / DRONE_FLASH_SEC;
      d.mesh.material.emissiveIntensity = 5 * (1 - t) + 2 * t;
    } else {
      const shrink = Math.max(0, 1 - (d.deathPhase - DRONE_FLASH_SEC) * DRONE_DEATH_SHRINK_SPEED);
      d.mesh.scale.setScalar(shrink);
      if (shrink <= 0.02) {
        scene.remove(d.mesh);
        d.mesh.material.dispose();
        drones.splice(i, 1);
      }
    }
  }
}

function syncDroneMeshes() {
  for (const d of drones) {
    if (d.dying) continue;
    d.mesh.position.copy(d.body.position);
    d.mesh.quaternion.copy(d.body.quaternion);
  }
}

let spawnTimer = 0;

let grabbedBody = null;
let grabGlowMesh = null;

const GRAB_GLOW_COLOR = 0x9966ff;
const GRAB_GLOW_INTENSITY = 0.55;
const GRAB_CUBE_OPACITY = 0.32;

function getLookedAtGrabbableMesh() {
  raycaster.setFromCamera(ndcCenter, camera);
  const hits = raycaster.intersectObjects(cubeMeshes, false);
  if (hits.length === 0) return null;
  const hit = hits[0];
  if (hit.distance > GRAB_REACH) return null;
  const mesh = hit.object;
  if (!mesh.userData.isGrabbable || !mesh.userData.body) return null;
  return mesh;
}

function getLookedAtCube() {
  const mesh = getLookedAtGrabbableMesh();
  return mesh ? mesh.userData.body : null;
}

function cubeMeshFromBody(body) {
  return cubeMeshes.find((m) => m.userData.body === body) ?? null;
}

function clearGrabGlow() {
  if (grabGlowMesh) {
    grabGlowMesh.material.emissive.setHex(0x000000);
    grabGlowMesh.material.emissiveIntensity = 0;
    grabGlowMesh = null;
  }
}

function updateGrabGlow(aimMesh) {
  if (
    grabbedBody &&
    aimMesh &&
    cubeMeshFromBody(grabbedBody) === aimMesh
  ) {
    clearGrabGlow();
    return;
  }
  if (grabGlowMesh === aimMesh) return;
  clearGrabGlow();
  if (aimMesh) {
    aimMesh.material.emissive.setHex(GRAB_GLOW_COLOR);
    aimMesh.material.emissiveIntensity = GRAB_GLOW_INTENSITY;
    grabGlowMesh = aimMesh;
  }
}

function applyGrabTransparency(mesh) {
  const mat = mesh.material;
  if (!mesh.userData.grabMatSave) {
    mesh.userData.grabMatSave = {
      opacity: mat.opacity,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite,
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity,
    };
  }
  mat.transparent = true;
  mat.opacity = GRAB_CUBE_OPACITY;
  mat.depthWrite = false;
  mat.needsUpdate = true;
}

function clearGrabTransparency(mesh) {
  const s = mesh.userData.grabMatSave;
  if (!s) return;
  const mat = mesh.material;
  mat.opacity = s.opacity;
  mat.transparent = s.transparent;
  mat.depthWrite = s.depthWrite;
  mat.emissive.copy(s.emissive);
  mat.emissiveIntensity = s.emissiveIntensity;
  mat.needsUpdate = true;
  delete mesh.userData.grabMatSave;
}

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousedown', (e) => {
  if (e.button !== 2 || !controls.isLocked) return;
  const body = getLookedAtCube();
  if (body) {
    clearGrabGlow();
    const mesh = cubeMeshFromBody(body);
    if (mesh) applyGrabTransparency(mesh);
    grabbedBody = body;
    body.wakeUp();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button !== 2) return;
  if (grabbedBody) {
    const mesh = cubeMeshFromBody(grabbedBody);
    if (mesh) clearGrabTransparency(mesh);
  }
  if (grabbedBody && controls.isLocked) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    grabbedBody.velocity.set(
      dir.x * LAUNCH_SPEED,
      dir.y * LAUNCH_SPEED,
      dir.z * LAUNCH_SPEED
    );
    grabbedBody.angularVelocity.set(
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4,
      (Math.random() - 0.5) * 4
    );
    handExtendedUntil = performance.now() + HAND_EXTENDED_MS;
    handShakeX += (Math.random() - 0.5) * 10 + (Math.random() < 0.5 ? -HAND_KICK_X : HAND_KICK_X);
    handShakeY += HAND_KICK_Y + Math.random() * 8;
  }
  grabbedBody = null;
});

const keys = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
};

window.addEventListener('keydown', (e) => {
  if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
  if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

const moveDir = new THREE.Vector3();
const forward = new THREE.Vector3();
const aimDir = new THREE.Vector3();
const right = new THREE.Vector3();
const pullTarget = new CANNON.Vec3();
const pullDelta = new CANNON.Vec3();

const clock = new THREE.Clock();

function syncMeshesFromPhysics() {
  for (const mesh of cubeMeshes) {
    const b = mesh.userData.body;
    mesh.position.copy(b.position);
    mesh.quaternion.copy(b.quaternion);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (controls.isLocked) {
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() > 1e-6) forward.normalize();
    else forward.set(0, 0, -1);

    right.crossVectors(forward, camera.up).normalize();

    moveDir.set(0, 0, 0);
    if (keys.KeyW) moveDir.add(forward);
    if (keys.KeyS) moveDir.sub(forward);
    if (keys.KeyD) moveDir.add(right);
    if (keys.KeyA) moveDir.sub(right);
    if (moveDir.lengthSq() > 0) {
      moveDir.normalize().multiplyScalar(MOVE_SPEED * dt);
      camera.position.x += moveDir.x;
      camera.position.z += moveDir.z;
    }
    camera.position.y = PLAYER_EYE_HEIGHT;

    const half = 58;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -half, half);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -half, half);

    if (grabbedBody) {
      camera.getWorldDirection(aimDir);
      pullTarget.set(
        camera.position.x + aimDir.x * 2.2,
        camera.position.y + aimDir.y * 2.2,
        camera.position.z + aimDir.z * 2.2
      );

      grabbedBody.wakeUp();
      pullDelta.set(
        pullTarget.x - grabbedBody.position.x,
        pullTarget.y - grabbedBody.position.y,
        pullTarget.z - grabbedBody.position.z
      );
      const dist = pullDelta.length();
      if (dist > 0.001) {
        pullDelta.scale(1 / dist, pullDelta);
        const speed = Math.min(dist * PULL_GAIN, PULL_MAX_SPEED);
        grabbedBody.velocity.set(
          pullDelta.x * speed,
          pullDelta.y * speed,
          pullDelta.z * speed
        );
      } else {
        grabbedBody.velocity.set(0, 0, 0);
      }
      grabbedBody.angularVelocity.scale(0.92, grabbedBody.angularVelocity);
    }
  }

  const shakeDecay = Math.pow(0.82, dt * 60);
  handShakeX *= shakeDecay;
  handShakeY *= shakeDecay;

  handSprite.position.set(handBaseX + handShakeX, handBaseY + handShakeY, 0);

  if (controls.isLocked) {
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      const alive = drones.filter((d) => !d.dying).length;
      if (alive < MAX_DRONES) {
        const p = randomSpawnPointAroundPlayer();
        createDrone(p.x, p.y, p.z);
      }
    }
  } else {
    spawnTimer = 0;
  }

  updateDronesAI(dt);

  world.fixedStep(1 / 60, 8);
  syncMeshesFromPhysics();
  syncDroneMeshes();
  updateDronesDeath(dt);

  if (controls.isLocked) {
    const aimMesh = getLookedAtGrabbableMesh();
    const grabbable = aimMesh !== null;
    crosshairMat.color.set(grabbable ? 0xff3048 : 0xffffff);
    updateGrabGlow(aimMesh);

    let desired = 'open';
    if (performance.now() < handExtendedUntil) {
      desired = 'extended';
    } else if (grabbedBody !== null) {
      desired = 'close';
    }
    if (desired !== lastHandVisual) {
      if (desired === 'open') handMat.map = texHandOpen;
      else if (desired === 'close') handMat.map = texHandClose;
      else handMat.map = texHandExtended;
      handMat.needsUpdate = true;
      lastHandVisual = desired;
    }

    sceneHUD.visible = true;
  } else {
    sceneHUD.visible = false;
    crosshairMat.color.set(0xffffff);
    clearGrabGlow();
  }

  composer.render();

  if (sceneHUD.visible) {
    const prev = renderer.autoClear;
    renderer.setRenderTarget(null);
    const bw = renderer.domElement.width;
    const bh = renderer.domElement.height;
    renderer.setViewport(0, 0, bw, bh);
    renderer.setScissorTest(false);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(sceneHUD, hudCamera);
    renderer.autoClear = prev;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  updateHudLayout();
});

animate();
