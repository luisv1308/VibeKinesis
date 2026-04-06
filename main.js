import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as CANNON from 'cannon-es';

const PLAYER_EYE_HEIGHT = 1.65;
const MOVE_SPEED = 12;
/** Alcance máximo del rayo de telequinesis (más pequeño = “escudo” más ajustado). */
const GRAB_REACH = 18;
const PULL_GAIN = 10;
const PULL_MAX_SPEED = 28;
const LAUNCH_SPEED = 42;
const LAUNCH_PROJECTILE_MULT = 1.5;

const PROJ_RADIUS = 0.22;
const PROJ_MASS = 0.16;
/** Radio solo visual (balas más visibles para apuntar/agarrar). */
const PROJ_VISUAL_SCALE = 2;
/** Esfera invisible grande solo para el raycaster (más fácil “pescar”). */
const PROJ_PICK_RADIUS = 0.58;
const BULLET_TIME_NEAR_DIST = 5;
const BULLET_TIME_SCALE = 0.2;
/** Más lento = tiempo de reacción y telequinesis jugables. */
const PROJ_ENEMY_SPEED = 19;
const DRONE_ATTACK_MIN_DIST = 10;
const DRONE_ATTACK_MAX_DIST = 20;
const DRONE_FIRE_COOLDOWN = 3;
const PLAYER_HIT_RADIUS = 0.55;

const DRONE_RADIUS = 0.38;
const DRONE_MASS = 0.55;
/** Evita spawnear la bala dentro del cuerpo del dron (solapamiento = empuje aleatorio del solver). */
const PROJ_SPAWN_CLEARANCE = DRONE_RADIUS + PROJ_RADIUS + 0.1;
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

/** Distancia recorrida máxima por proyectil enemigo (trayectoria recta); al superarla se elimina. */
const PROJ_MAX_PATH_TRAVEL = 85;
/** Segundos máximos de vida (respaldo). */
const PROJ_MAX_LIFE = 40;
/** Mismo límite horizontal que el jugador (cámara clamp ±ARENA_HALF). Fuera → se elimina el disparo enemigo. */
const ARENA_HALF = 58;
const ARENA_Y_MIN = -2;
const ARENA_Y_MAX = 80;

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

/** Referencia invisible que sigue a la cámara: puntería de drones y vector de disparo. */
const playerTarget = new THREE.Object3D();
playerTarget.name = 'playerTarget';
scene.add(playerTarget);
playerTarget.position.copy(camera.position);

let physicsTimeScale = 1;

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
const pauseOverlayEl = document.getElementById('pauseOverlay');
let isPaused = false;
const damageFlashEl = document.getElementById('damageFlash');
let damageFlashTimer = 0;

function triggerDamageFeedback() {
  damageFlashTimer = 0.28;
  if (damageFlashEl) damageFlashEl.style.opacity = '0.5';
}

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
  shieldPressed = false;
  releaseShieldStuckProjectiles();
  if (grabbedBody) {
    const mesh = meshFromBody(grabbedBody);
    if (mesh) clearGrabTransparency(mesh);
    grabbedBody = null;
  }
});

window.addEventListener('blur', () => {
  shieldPressed = false;
  releaseShieldStuckProjectiles();
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

/** Escudo magnético en el plano de la vista (un poco delante del jugador). */
const SHIELD_VIEW_DIST = 2.65;
const SHIELD_RING_OUTER = 0.52;
const SHIELD_RING_INNER = SHIELD_RING_OUTER - 0.07;
const SHIELD_RING_INNER2_OUTER = SHIELD_RING_OUTER * 0.52;
const SHIELD_RING_INNER2_INNER = SHIELD_RING_OUTER * 0.48;
/** Mitad del grosor del plano de captura (más generoso que el anillo visual). */
const SHIELD_CAPTURE_THICK = 1.15;
const SHIELD_DROP_SEC = 2;

const magnetShieldGroup = new THREE.Group();
{
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(SHIELD_RING_INNER, SHIELD_RING_OUTER, 96),
    new THREE.MeshBasicMaterial({
      color: 0x55f0ff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  magnetShieldGroup.add(ring);

  const inner = new THREE.Mesh(
    new THREE.RingGeometry(SHIELD_RING_INNER2_INNER, SHIELD_RING_INNER2_OUTER, 72),
    new THREE.MeshBasicMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  magnetShieldGroup.add(inner);
}
magnetShieldGroup.visible = false;
magnetShieldGroup.renderOrder = 2;
scene.add(magnetShieldGroup);

const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

const playerBody = new CANNON.Body({ mass: 0 });
playerBody.type = CANNON.Body.STATIC;
playerBody.addShape(new CANNON.Sphere(PLAYER_HIT_RADIUS));
playerBody.userData = { isPlayer: true };
world.addBody(playerBody);

const cubeMeshes = [];
const projectileMeshes = [];
const enemyProjectiles = [];

const projGeo = new THREE.SphereGeometry(PROJ_RADIUS, 12, 12);
const pickGeo = new THREE.SphereGeometry(PROJ_PICK_RADIUS, 16, 16);
const raycaster = new THREE.Raycaster();
const ndcCenter = new THREE.Vector2(0, 0);
const _tmpBulletNear = new THREE.Vector3();
const _shieldOffsetLocal = new THREE.Vector3();
const _shieldCenter = new THREE.Vector3();
const _shieldNormal = new THREE.Vector3();
const _toProjShield = new THREE.Vector3();
const _radialShield = new THREE.Vector3();
const _shieldBasisRight = new THREE.Vector3();
const _shieldBasisUp = new THREE.Vector3();
const _pinShieldPos = new THREE.Vector3();
const _worldUpY = new THREE.Vector3(0, 1, 0);

class EnemyBullet {
  constructor(ent) {
    this.ent = ent;
    ent.group.userData.enemyBulletClass = this;
  }
}

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
    shootTimer: 0,
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
    _droneToPlayer.set(
      playerTarget.position.x - b.position.x,
      playerTarget.position.y - b.position.y,
      playerTarget.position.z - b.position.z
    );
    const distToCam = _droneToPlayer.length();
    const inAttackBand =
      distToCam >= DRONE_ATTACK_MIN_DIST && distToCam <= DRONE_ATTACK_MAX_DIST;

    if (inAttackBand) {
      d.mesh.position.set(b.position.x, b.position.y, b.position.z);
      d.mesh.lookAt(playerTarget.position);
      d.shootTimer += dt;
      if (d.shootTimer >= DRONE_FIRE_COOLDOWN) {
        d.shootTimer = 0;
        createEnemyProjectile(
          b.position.x,
          b.position.y,
          b.position.z,
          playerTarget.position.x,
          playerTarget.position.y,
          playerTarget.position.z
        );
      }
      continue;
    }

    d.shootTimer = 0;

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
  }
}

function captureProjectileVisual(ent) {
  ent.state = 'friendly';
  ent.pathTraveled = 0;
  delete ent.enemyDir;
  const mat = ent.visualMesh.material;
  mat.color.setHex(0x22eeff);
  mat.emissive.setHex(0x00ccff);
  mat.emissiveIntensity = 2.1;
  mat.needsUpdate = true;
}

function onProjectileCollide(ent, other) {
  if (!ent || ent.dead) return;
  if (other === groundBody && ent.state === 'enemy') {
    if (ent.shieldStuck) return;
    removeProjectile(ent);
    return;
  }
  if (other === playerBody && ent.state === 'enemy') {
    if (ent.shieldStuck) return;
    removeProjectile(ent);
    triggerDamageFeedback();
    return;
  }
  if (ent.state === 'friendly') {
    const drone = drones.find((d) => !d.dying && d.body === other);
    if (drone) {
      killDrone(drone);
      removeProjectile(ent);
    }
  }
}

function releaseShieldStuckProjectiles() {
  for (const ent of enemyProjectiles) {
    if (!ent.shieldStuck) continue;
    ent.shieldStuck = false;
    ent.shieldDropping = true;
    ent.shieldDropSec = SHIELD_DROP_SEC;
    delete ent.enemyDir;
    delete ent.shieldStickU;
    delete ent.shieldStickV;
    const b = ent.body;
    b.wakeUp();
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
  }
}

function removeProjectile(ent) {
  if (ent.dead) return;
  ent.dead = true;
  if (grabGlowMesh === ent.visualMesh) clearGrabGlow();
  if (grabbedBody === ent.body) {
    const mesh = meshFromBody(ent.body);
    if (mesh) clearGrabTransparency(mesh);
    grabbedBody = null;
  }
  const ei = enemyProjectiles.indexOf(ent);
  if (ei >= 0) enemyProjectiles.splice(ei, 1);
  const mi = projectileMeshes.indexOf(ent.group);
  if (mi >= 0) projectileMeshes.splice(mi, 1);
  world.removeBody(ent.body);
  ent.visualMesh.material.dispose();
  ent.pickMesh.material.dispose();
  scene.remove(ent.group);
}

function createEnemyProjectile(ox, oy, oz, tx, ty, tz) {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  let nx;
  let ny;
  let nz;
  if (dist < 1e-5) {
    nx = 0;
    ny = 0;
    nz = -1;
  } else {
    const inv = 1 / dist;
    nx = dx * inv;
    ny = dy * inv;
    nz = dz * inv;
  }
  /** Salir del volumen del dron antes del primer paso de física (vector = playerTarget − centro dron). */
  const along =
    dist > PROJ_SPAWN_CLEARANCE
      ? PROJ_SPAWN_CLEARANCE
      : Math.max(0, dist * 0.4);
  const sx = ox + nx * along;
  const sy = oy + ny * along;
  const sz = oz + nz * along;

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffcc44,
    emissive: 0xff6600,
    emissiveIntensity: 2.5,
    metalness: 0.2,
    roughness: 0.35,
  });
  const visualMesh = new THREE.Mesh(projGeo, mat);
  visualMesh.scale.setScalar(PROJ_VISUAL_SCALE);
  visualMesh.castShadow = true;

  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    color: 0x000000,
  });
  const pickMesh = new THREE.Mesh(pickGeo, pickMat);

  const group = new THREE.Group();
  group.add(visualMesh);
  group.add(pickMesh);
  scene.add(group);

  const shape = new CANNON.Sphere(PROJ_RADIUS);
  const body = new CANNON.Body({
    mass: PROJ_MASS,
    linearDamping: 0,
    angularDamping: 0.35,
    position: new CANNON.Vec3(sx, sy, sz),
    collisionResponse: true,
  });
  body.addShape(shape);

  body.velocity.set(
    nx * PROJ_ENEMY_SPEED,
    ny * PROJ_ENEMY_SPEED,
    nz * PROJ_ENEMY_SPEED
  );

  const ent = {
    group,
    visualMesh,
    pickMesh,
    body,
    state: 'enemy',
    age: 0,
    pathTraveled: 0,
    dead: false,
    /** Dirección de vuelo fija (sin gravedad; se re-aplica cada frame). */
    enemyDir: { x: nx, y: ny, z: nz },
  };
  new EnemyBullet(ent);

  body.userData = { projectileEnt: ent };

  visualMesh.userData = {
    body,
    isGrabbable: true,
    isProjectile: true,
    projectileEnt: ent,
  };
  pickMesh.userData = {
    body,
    isGrabbable: true,
    isProjectile: true,
    projectileEnt: ent,
    visualMesh,
    isProjectilePick: true,
  };
  group.userData = {
    body,
    isProjectile: true,
    projectileEnt: ent,
    visualMesh,
    pickMesh,
  };

  body.addEventListener('collide', (e) => {
    onProjectileCollide(ent, e.body);
  });

  world.addBody(body);
  projectileMeshes.push(group);
  enemyProjectiles.push(ent);
  return ent;
}

function updateProjectileLife(dt) {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const ent = enemyProjectiles[i];
    if (ent.dead) continue;
    ent.age += dt;
    if (ent.shieldStuck) {
      continue;
    }
    if (ent.shieldDropping) {
      ent.shieldDropSec -= dt;
      if (ent.shieldDropSec <= 0) {
        removeProjectile(ent);
      }
      continue;
    }
    const p = ent.body.position;
    if (
      ent.state === 'enemy' &&
      grabbedBody !== ent.body &&
      (Math.abs(p.x) > ARENA_HALF ||
        Math.abs(p.z) > ARENA_HALF ||
        p.y < ARENA_Y_MIN ||
        p.y > ARENA_Y_MAX)
    ) {
      removeProjectile(ent);
      continue;
    }
    if (grabbedBody !== ent.body) {
      const spd =
        ent.state === 'enemy' && ent.enemyDir
          ? PROJ_ENEMY_SPEED
          : ent.body.velocity.length();
      ent.pathTraveled += spd * dt;
      if (ent.pathTraveled > PROJ_MAX_PATH_TRAVEL) {
        removeProjectile(ent);
        continue;
      }
    }
    if (ent.age > PROJ_MAX_LIFE && grabbedBody !== ent.body) {
      removeProjectile(ent);
    }
  }
}

/** Antes de integrar: quita la gravedad global del `force` (solo disparos enemigos). */
function cancelEnemyProjectileGravity() {
  const g = world.gravity;
  const gx = g.x;
  const gy = g.y;
  const gz = g.z;
  for (const ent of enemyProjectiles) {
    if (ent.dead || ent.state !== 'enemy' || !ent.enemyDir) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;
    if (grabbedBody === ent.body) continue;
    const b = ent.body;
    const m = b.mass;
    b.force.x -= m * gx;
    b.force.y -= m * gy;
    b.force.z -= m * gz;
  }
}

/** Después del paso: velocidad constante en línea recta (sin caída ni rebote). */
function enforceEnemyProjectileStraightFlight() {
  for (const ent of enemyProjectiles) {
    if (ent.dead || ent.state !== 'enemy' || !ent.enemyDir) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;
    if (grabbedBody === ent.body) continue;
    const d = ent.enemyDir;
    const b = ent.body;
    b.velocity.set(
      d.x * PROJ_ENEMY_SPEED,
      d.y * PROJ_ENEMY_SPEED,
      d.z * PROJ_ENEMY_SPEED
    );
    b.angularVelocity.set(0, 0, 0);
  }
}

world.addEventListener('preStep', cancelEnemyProjectileGravity);
world.addEventListener('postStep', enforceEnemyProjectileStraightFlight);

function computeShieldFrame() {
  camera.getWorldDirection(_shieldNormal);
  _shieldOffsetLocal.set(0, -0.1, -SHIELD_VIEW_DIST);
  _shieldOffsetLocal.applyQuaternion(camera.quaternion);
  _shieldCenter.copy(camera.position).add(_shieldOffsetLocal);
  _shieldBasisRight.crossVectors(_worldUpY, _shieldNormal);
  if (_shieldBasisRight.lengthSq() < 1e-8) {
    _shieldBasisRight.set(1, 0, 0);
  } else {
    _shieldBasisRight.normalize();
  }
  _shieldBasisUp.crossVectors(_shieldNormal, _shieldBasisRight).normalize();
}

/** Escudo activo: atrapa proyectiles en el disco y los fija; al soltar caen con gravedad ~2 s. */
function updateShieldStuckProjectiles() {
  if (isPaused || !controls.isLocked) return;
  if (!shieldPressed) {
    for (const ent of enemyProjectiles) {
      if (ent.shieldStuck) {
        releaseShieldStuckProjectiles();
        break;
      }
    }
    return;
  }
  computeShieldFrame();

  const maxStickR = SHIELD_RING_OUTER - PROJ_RADIUS * 0.35;
  const captureR = SHIELD_RING_OUTER + PROJ_RADIUS + 0.5;
  for (const ent of enemyProjectiles) {
    if (ent.dead || ent.state !== 'enemy' || grabbedBody === ent.body) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;

    const p = ent.body.position;
    const v = ent.body.velocity;
    _toProjShield.set(
      p.x - _shieldCenter.x,
      p.y - _shieldCenter.y,
      p.z - _shieldCenter.z
    );
    const distPlane = Math.abs(_toProjShield.dot(_shieldNormal));
    if (distPlane > SHIELD_CAPTURE_THICK) continue;

    _radialShield.copy(_toProjShield);
    _radialShield.addScaledVector(
      _shieldNormal,
      -_toProjShield.dot(_shieldNormal)
    );
    if (_radialShield.length() > captureR) continue;

    if (v.lengthSquared() > 1) {
      const vd =
        v.x * _shieldNormal.x +
        v.y * _shieldNormal.y +
        v.z * _shieldNormal.z;
      if (vd > 0.35) continue;
    }

    let su = _radialShield.dot(_shieldBasisRight);
    let sv = _radialShield.dot(_shieldBasisUp);
    const rStick = Math.hypot(su, sv);
    if (rStick > maxStickR && rStick > 1e-6) {
      const s = maxStickR / rStick;
      su *= s;
      sv *= s;
    }
    ent.shieldStuck = true;
    ent.shieldStickU = su;
    ent.shieldStickV = sv;
  }

  for (const ent of enemyProjectiles) {
    if (!ent.shieldStuck || ent.shieldDropping) continue;
    const su = ent.shieldStickU;
    const sv = ent.shieldStickV;
    const bump = PROJ_RADIUS + 0.06;
    _pinShieldPos.copy(_shieldCenter);
    _pinShieldPos.addScaledVector(_shieldBasisRight, su);
    _pinShieldPos.addScaledVector(_shieldBasisUp, sv);
    _pinShieldPos.addScaledVector(_shieldNormal, bump);
    const b = ent.body;
    b.position.set(_pinShieldPos.x, _pinShieldPos.y, _pinShieldPos.z);
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
  }
}

function syncProjectileMeshes() {
  for (const ent of enemyProjectiles) {
    if (ent.dead) continue;
    ent.group.position.copy(ent.body.position);
    ent.group.quaternion.copy(ent.body.quaternion);
  }
}

function updateBulletTimeAndPhysicsScale() {
  if (grabbedBody?.userData?.projectileEnt) {
    physicsTimeScale = 1;
    return;
  }
  let near = false;
  for (const ent of enemyProjectiles) {
    if (ent.dead || ent.state !== 'enemy') continue;
    const p = ent.body.position;
    _tmpBulletNear.set(p.x, p.y, p.z);
    if (
      camera.position.distanceToSquared(_tmpBulletNear) <
      BULLET_TIME_NEAR_DIST * BULLET_TIME_NEAR_DIST
    ) {
      near = true;
      break;
    }
  }
  if (!near) {
    raycaster.setFromCamera(ndcCenter, camera);
    const hits = raycaster.intersectObjects(projectileMeshes, true);
    for (const h of hits) {
      if (h.distance >= BULLET_TIME_NEAR_DIST) continue;
      const pe = h.object.userData?.projectileEnt;
      if (pe && !pe.dead && pe.state === 'enemy') {
        near = true;
        break;
      }
    }
  }
  physicsTimeScale = near ? BULLET_TIME_SCALE : 1;
}

let spawnTimer = 0;

let grabbedBody = null;
let grabGlowMesh = null;
/** Clic izquierdo mantenido: escudo magnético + gesto de mano. */
let shieldPressed = false;

const GRAB_GLOW_COLOR = 0x9966ff;
const GRAB_GLOW_INTENSITY = 0.55;
const GRAB_CUBE_OPACITY = 0.32;

function getLookedAtGrabbableMesh() {
  raycaster.setFromCamera(ndcCenter, camera);
  const hits = raycaster.intersectObjects(
    [...cubeMeshes, ...projectileMeshes],
    true
  );
  hits.sort((a, b) => a.distance - b.distance);
  for (const hit of hits) {
    if (hit.distance > GRAB_REACH) return null;
    const o = hit.object;
    if (o.userData?.visualMesh && o.userData?.isProjectilePick) {
      return o.userData.visualMesh;
    }
    if (o.userData?.isGrabbable && o.userData?.body) {
      return o;
    }
  }
  return null;
}

function getLookedAtGrabbableBody() {
  const mesh = getLookedAtGrabbableMesh();
  return mesh ? mesh.userData.body : null;
}

function meshFromBody(body) {
  if (!body) return null;
  const cube = cubeMeshes.find((m) => m.userData.body === body);
  if (cube) return cube;
  const projRoot = projectileMeshes.find((m) => m.userData.body === body);
  if (projRoot?.userData?.visualMesh) return projRoot.userData.visualMesh;
  return null;
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
    meshFromBody(grabbedBody) === aimMesh
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
  if (e.button === 0) {
    if (!isPaused && controls.isLocked) shieldPressed = true;
    return;
  }
  if (isPaused || e.button !== 2 || !controls.isLocked) return;
  const body = getLookedAtGrabbableBody();
  if (body) {
    const peGrab = body.userData?.projectileEnt;
    if (peGrab) {
      if (peGrab.shieldStuck) {
        peGrab.shieldStuck = false;
        delete peGrab.shieldStickU;
        delete peGrab.shieldStickV;
      }
      if (peGrab.shieldDropping) {
        peGrab.shieldDropping = false;
        delete peGrab.shieldDropSec;
        if (peGrab.state === 'enemy') {
          const vv = body.velocity;
          const len = Math.hypot(vv.x, vv.y, vv.z);
          if (len > 0.8) {
            const inv = 1 / len;
            peGrab.enemyDir = { x: vv.x * inv, y: vv.y * inv, z: vv.z * inv };
          } else {
            camera.getWorldDirection(aimDir);
            peGrab.enemyDir = { x: aimDir.x, y: aimDir.y, z: aimDir.z };
          }
        }
      }
      physicsTimeScale = 1;
    }
    clearGrabGlow();
    const mesh = meshFromBody(body);
    if (mesh) {
      if (mesh.userData.isProjectile && mesh.userData.projectileEnt) {
        const pe = mesh.userData.projectileEnt;
        if (pe.state === 'enemy') captureProjectileVisual(pe);
      }
      applyGrabTransparency(mesh);
    }
    grabbedBody = body;
    body.wakeUp();
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    shieldPressed = false;
    releaseShieldStuckProjectiles();
  }
  if (isPaused || e.button !== 2) return;
  if (grabbedBody) {
    const mesh = meshFromBody(grabbedBody);
    if (mesh) clearGrabTransparency(mesh);
  }
  if (grabbedBody && controls.isLocked) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const pe = grabbedBody.userData?.projectileEnt;
    if (pe) {
      pe.pathTraveled = 0;
    }
    const launchSpeed = pe
      ? LAUNCH_SPEED * LAUNCH_PROJECTILE_MULT
      : LAUNCH_SPEED;
    grabbedBody.velocity.set(
      dir.x * launchSpeed,
      dir.y * launchSpeed,
      dir.z * launchSpeed
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
  if (e.code === 'KeyP' && !e.repeat) {
    isPaused = !isPaused;
    if (pauseOverlayEl) {
      pauseOverlayEl.classList.toggle('visible', isPaused);
      pauseOverlayEl.setAttribute('aria-hidden', isPaused ? 'false' : 'true');
    }
    if (isPaused) {
      shieldPressed = false;
      releaseShieldStuckProjectiles();
      keys.KeyW = false;
      keys.KeyA = false;
      keys.KeyS = false;
      keys.KeyD = false;
    }
    return;
  }
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

function syncPlayerHitBody() {
  playerBody.position.set(
    camera.position.x,
    camera.position.y,
    camera.position.z
  );
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (!isPaused) {
    damageFlashTimer = Math.max(0, damageFlashTimer - dt);
    if (damageFlashEl) {
      damageFlashEl.style.opacity =
        damageFlashTimer > 0 ? String(0.5 * (damageFlashTimer / 0.28)) : '0';
    }
  }

  if (controls.isLocked && !isPaused) {
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

  if (!isPaused) {
    const shakeDecay = Math.pow(0.82, dt * 60);
    handShakeX *= shakeDecay;
    handShakeY *= shakeDecay;
  }

  handSprite.position.set(handBaseX + handShakeX, handBaseY + handShakeY, 0);

  if (controls.isLocked && !isPaused) {
    spawnTimer += dt;
    if (spawnTimer >= SPAWN_INTERVAL) {
      spawnTimer = 0;
      const alive = drones.filter((d) => !d.dying).length;
      if (alive < MAX_DRONES) {
        const p = randomSpawnPointAroundPlayer();
        createDrone(p.x, p.y, p.z);
      }
    }
  } else if (!controls.isLocked) {
    spawnTimer = 0;
  }

  if (!isPaused) {
    playerTarget.position.copy(camera.position);

    updateBulletTimeAndPhysicsScale();
    updateDronesAI(dt);
    updateProjectileLife(dt);
    syncPlayerHitBody();

    world.fixedStep((1 / 60) * physicsTimeScale, 8);
    syncMeshesFromPhysics();
    syncDroneMeshes();
    syncProjectileMeshes();
    updateShieldStuckProjectiles();
    updateDronesDeath(dt);
  }

  if (controls.isLocked) {
    const showShield = !isPaused && shieldPressed;
    magnetShieldGroup.visible = showShield;
    if (showShield) {
      _shieldOffsetLocal.set(0, -0.1, -SHIELD_VIEW_DIST);
      _shieldOffsetLocal.applyQuaternion(camera.quaternion);
      magnetShieldGroup.position.copy(camera.position);
      magnetShieldGroup.position.add(_shieldOffsetLocal);
      magnetShieldGroup.quaternion.copy(camera.quaternion);
    }

    let grabbable = false;
    if (!isPaused) {
      const aimMesh = getLookedAtGrabbableMesh();
      grabbable = aimMesh !== null;
      crosshairMat.color.set(grabbable ? 0xff3048 : 0xffffff);
      updateGrabGlow(aimMesh);
    } else {
      crosshairMat.color.set(0xffffff);
      clearGrabGlow();
    }

    let desired = 'open';
    if (!isPaused) {
      if (grabbedBody !== null) {
        desired = 'close';
      } else if (shieldPressed) {
        desired = 'extended';
      } else if (performance.now() < handExtendedUntil) {
        desired = 'extended';
      } else {
        desired = 'open';
      }
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
    magnetShieldGroup.visible = false;
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
