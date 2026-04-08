import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as CANNON from 'cannon-es';
import { createDronesSystem } from './src/game/drones.js';
import {
  ARENA_HALF,
  ARENA_WALL_HALF_THICK,
  ARENA_WALL_HEIGHT,
  ARENA_Y_MAX,
  ARENA_Y_MIN,
  BUBBLE_GROUND_RESTITUTION,
  BUBBLE_MAX_SPEED,
  BUBBLE_MIN_SPEED,
  BUBBLE_RANDOM_IMPULSE,
  BUBBLE_SPEED_RETENTION,
  BUBBLE_WALL_RESTITUTION,
  BULLET_TIME_NEAR_DIST,
  BULLET_TIME_SCALE,
  COLLISION_GROUP_DRONE,
  COLLISION_GROUP_ENEMY_PROJECTILE,
  COLLISION_GROUP_FUSION_A,
  COLLISION_GROUP_FUSION_B,
  COLLISION_GROUP_PLAYER_BODY,
  COLLISION_MASK_ENEMY_PROJECTILE,
  ELITE_SPAWN_EVERY_NORMAL_KILLS,
  EXPLOSIVE_ARM_DELAY_MS,
  EXPLOSIVE_CUBE_BLAST_RADIUS,
  EXPLOSIVE_DETONATE_SPEED,
  FUSION_EXPLOSION_LIGHT_DURATION,
  FUSION_EXPLOSION_PARTICLE_COUNT,
  FUSION_EXPLOSION_PARTICLE_LIFE,
  FUSION_EXPLOSION_SHAKE_BASE,
  FUSION_EXPLOSION_TRIGGER_DURATION,
  FUSION_EXPLOSION_TRIGGER_MAX_RADIUS,
  FUSION_IMPACT_MIN_SPEED_CUBE,
  FUSION_LINE_COLOR,
  FUSION_MERGE_DIST,
  FUSION_PREVIEW_GLOW,
  FUSION_PREVIEW_INTENSITY_CUBE,
  FUSION_PREVIEW_INTENSITY_PROJ,
  FUSION_PREVIEW_TINT,
  FUSION_SPEED,
  FUSION_SPAWN_GROUND_CLEARANCE,
  GRAB_REACH,
  HAND_ANCHOR_Y_FRAC,
  HAND_EXTENDED_MS,
  HAND_KICK_X,
  HAND_KICK_Y,
  HAND_LEFT_ANCHOR_X_FRAC,
  HAND_RIGHT_ANCHOR_X_FRAC,
  HAND_SIZE_PX,
  LAUNCH_PROJECTILE_MULT,
  LAUNCH_SPEED,
  MAX_DRONES,
  MEGA_CUBE_COLOR,
  MEGA_CUBE_HALF,
  MEGA_CUBE_MASS,
  MOVE_SPEED,
  PLASMA_MAX_TIER,
  PLASMA_PICK_SCALE_PER_TIER,
  PLASMA_PIERCE_PER_STACK,
  PLASMA_RADIUS_GROWTH,
  PLASMA_VISUAL_GROW_PER_TIER,
  PLAYER_EYE_HEIGHT,
  PLAYER_HIT_RADIUS,
  PROJ_BUBBLE_MAX_LIFE,
  PROJ_ENEMY_SPEED,
  PROJ_FRIENDLY_STRAIGHT_MAX_PATH,
  PROJ_GRAVITY_BLEND_Y,
  PROJ_GRAVITY_CANCEL_STRAIGHT,
  PROJ_MASS,
  PROJ_MAX_LIFE,
  PROJ_MAX_PATH_TRAVEL,
  PROJ_PICK_RADIUS,
  PROJ_PLASMA_MAX_PATH,
  PROJ_PLASMA_PIERCE_COUNT,
  PROJ_PLASMA_SPEED,
  PROJ_RADIUS,
  PROJ_SPAWN_CLEARANCE,
  PROJ_VISUAL_SCALE,
  PULL_GAIN,
  PULL_MAX_SPEED,
  SPAWN_INTERVAL,
  TEST_MG_A,
  TEST_MG_B,
  TEST_MG_FIRE_INTERVAL,
  TEST_MODE_DUAL_MG,
  TEST_MODE_NO_DRONES,
  VORTEX_DIST,
  VORTEX_JITTER_AMP,
  VORTEX_LAUNCH_IMMUNE_MS,
  VORTEX_LERP,
  VORTEX_MAX_CAPTURED,
  VORTEX_ORBIT_R,
  VORTEX_RADIUS,
} from './src/config/constants.js';

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

/** Espejo horizontal real (el scale negativo del sprite no invierte bien la textura). */
function createMirroredHandTexture(source) {
  const t = source.clone();
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(-1, 1);
  t.offset.set(1, 0);
  t.needsUpdate = true;
  return t;
}

let texHandOpenL = createMirroredHandTexture(texHandOpen);
let texHandCloseL = createMirroredHandTexture(texHandClose);
let texHandExtendedL = createMirroredHandTexture(texHandExtended);

let lastRightHandVisual = 'open';
let lastLeftHandVisual = 'open';

function applyHandTextureToMaterial(mat, visual, forLeftHand) {
  if (forLeftHand) {
    if (visual === 'open') mat.map = texHandOpenL;
    else if (visual === 'close') mat.map = texHandCloseL;
    else mat.map = texHandExtendedL;
  } else {
    if (visual === 'open') mat.map = texHandOpen;
    else if (visual === 'close') mat.map = texHandClose;
    else mat.map = texHandExtended;
  }
  mat.needsUpdate = true;
}

function syncHandMaterialMap() {
  applyHandTextureToMaterial(rightHandMat, lastRightHandVisual, false);
  applyHandTextureToMaterial(leftHandMat, lastLeftHandVisual, true);
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
  texHandOpenL.dispose();
  texHandOpenL = createMirroredHandTexture(t);
});
loadHandPng(`${assetBase}single_hand_close.png`, (t) => {
  texHandClose = t;
  texHandCloseL.dispose();
  texHandCloseL = createMirroredHandTexture(t);
});
loadHandPng(`${assetBase}original_hand_extended.png`, (t) => {
  texHandExtended = t;
  texHandExtendedL.dispose();
  texHandExtendedL = createMirroredHandTexture(t);
});

const rightHandMat = new THREE.SpriteMaterial({
  map: texHandOpen,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  sizeAttenuation: false,
  alphaTest: 0.01,
});
const rightHandSprite = new THREE.Sprite(rightHandMat);
rightHandSprite.scale.set(HAND_SIZE_PX, HAND_SIZE_PX, 1);
rightHandSprite.renderOrder = 5;
sceneHUD.add(rightHandSprite);

const leftHandMat = new THREE.SpriteMaterial({
  map: texHandOpen,
  transparent: true,
  depthTest: false,
  depthWrite: false,
  sizeAttenuation: false,
  alphaTest: 0.01,
});
const leftHandSprite = new THREE.Sprite(leftHandMat);
leftHandSprite.scale.set(HAND_SIZE_PX, HAND_SIZE_PX, 1);
leftHandSprite.renderOrder = 5;
sceneHUD.add(leftHandSprite);

let handRightBaseX = 0;
let handLeftBaseX = 0;
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

  handRightBaseX = w * HAND_RIGHT_ANCHOR_X_FRAC;
  handLeftBaseX = w * HAND_LEFT_ANCHOR_X_FRAC;
  handBaseY = h * HAND_ANCHOR_Y_FRAC;
  rightHandSprite.position.set(
    handRightBaseX + handShakeX,
    handBaseY + handShakeY,
    0
  );
  leftHandSprite.position.set(handLeftBaseX, handBaseY, 0);
}

updateHudLayout();

const controls = new PointerLockControls(camera, document.body);

const blocker = document.getElementById('blocker');
const pauseOverlayEl = document.getElementById('pauseOverlay');
let isPaused = false;
const damageFlashEl = document.getElementById('damageFlash');
let damageFlashTimer = 0;

const hudKillsEl = document.getElementById('hudKills');
const hudTimeEl = document.getElementById('hudTime');
const hudWaveEl = document.getElementById('hudWave');
const hudLivesEl = document.getElementById('hudLives');
const gameOverOverlayEl = document.getElementById('gameOverOverlay');
const gameOverScoreEl = document.getElementById('gameOverScore');

let isGameOver = false;
let enemiesDefeated = 0;
/** Solo normales: cada N derrotados aparece un élite. */
let normalKillsForElite = 0;
let gameTimeSec = 0;
let playerLives = 3;

function formatTimeMMSS(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function updateGameHud() {
  if (hudKillsEl) hudKillsEl.textContent = `Derrotados: ${enemiesDefeated}`;
  if (hudTimeEl) hudTimeEl.textContent = formatTimeMMSS(gameTimeSec);
  const wave = Math.floor(enemiesDefeated / 10) + 1;
  if (hudWaveEl) hudWaveEl.textContent = `Ola ${wave}`;
  if (hudLivesEl) {
    hudLivesEl.textContent = '♥'.repeat(Math.max(0, playerLives));
  }
}

function triggerDamageFeedback() {
  damageFlashTimer = 0.35;
  if (damageFlashEl) damageFlashEl.style.opacity = '0.62';
}

function showGameOver() {
  if (isGameOver) return;
  isGameOver = true;
  isPaused = false;
  if (pauseOverlayEl) {
    pauseOverlayEl.classList.remove('visible');
    pauseOverlayEl.setAttribute('aria-hidden', 'true');
  }
  if (gameOverScoreEl) gameOverScoreEl.textContent = String(enemiesDefeated);
  if (gameOverOverlayEl) {
    gameOverOverlayEl.classList.add('visible');
    gameOverOverlayEl.setAttribute('aria-hidden', 'false');
  }
  controls.unlock();
  blocker.classList.add('hidden');
}

function onPlayerHit() {
  if (isGameOver) return;
  playerLives -= 1;
  triggerDamageFeedback();
  updateGameHud();
  if (playerLives <= 0) showGameOver();
}

document.addEventListener('click', () => {
  if (isGameOver) return;
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
  abortMagneticFusionKeepBodies();
  releaseAllMagneticCapture();
  releaseShieldStuckProjectiles();
  if (grabbedBody) {
    const mesh = meshFromBody(grabbedBody);
    if (mesh) clearGrabTransparency(mesh);
    grabbedBody = null;
  }
});

window.addEventListener('blur', () => {
  shieldPressed = false;
  abortMagneticFusionKeepBodies();
  releaseAllMagneticCapture();
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
/** Opacidad del proyectil pegado al escudo (ver a través hacia la mira). */
const SHIELD_STUCK_PROJ_OPACITY = 0.24;
const SHIELD_STUCK_PROJ_EMISSIVE_MULT = 0.4;

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

{
  const H = ARENA_WALL_HEIGHT;
  const AH = ARENA_HALF;
  const T = ARENA_WALL_HALF_THICK;
  const yc = H * 0.5;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x2a3144,
    roughness: 0.9,
    metalness: 0.1,
    emissive: 0x080c18,
    emissiveIntensity: 0.22,
  });
  const addWall = (cx, cy, cz, hx, hy, hz) => {
    const shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(cx, cy, cz);
    body.userData = { isArenaWall: true };
    world.addBody(body);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      wallMat
    );
    mesh.position.set(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  addWall(AH + T, yc, 0, T, H * 0.5, AH + T);
  addWall(-AH - T, yc, 0, T, H * 0.5, AH + T);
  addWall(0, yc, AH + T, AH + T, H * 0.5, T);
  addWall(0, yc, -AH - T, AH + T, H * 0.5, T);
}

const playerBody = new CANNON.Body({ mass: 0 });
playerBody.type = CANNON.Body.STATIC;
playerBody.addShape(new CANNON.Sphere(PLAYER_HIT_RADIUS));
playerBody.collisionFilterGroup = COLLISION_GROUP_PLAYER_BODY;
playerBody.collisionFilterMask = -1;
playerBody.userData = { isPlayer: true };
world.addBody(playerBody);

const cubeMeshes = [];
const projectileMeshes = [];
const enemyProjectiles = [];

let createEnemyProjectileRef = () => {};
/** Asignado tras `fusionCameraShake` (feedback élite). */
let addEliteCombatShake = () => {};
const {
  drones,
  randomSpawnPointAroundPlayer,
  createDrone,
  killDrone,
  updateDronesAI,
  updateDronesDeath,
  syncDroneMeshes,
  killDronesInSphere,
} = createDronesSystem({
  scene,
  world,
  playerTarget,
  getCubeMeshes: () => cubeMeshes,
  createEnemyProjectile: (...a) => createEnemyProjectileRef(...a),
  addCombatShake: (amp) => addEliteCombatShake(amp),
  onDroneKill(drone, { requestEliteSpawn }) {
    enemiesDefeated += 1;
    if (!drone.elite) {
      normalKillsForElite += 1;
      if (
        normalKillsForElite % ELITE_SPAWN_EVERY_NORMAL_KILLS === 0 &&
        !isGameOver
      ) {
        requestEliteSpawn();
      }
    }
    updateGameHud();
  },
});

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
const _vortexPt = new THREE.Vector3();
const _vortexSlot = new THREE.Vector3();
const _vortexLaunchDir = new THREE.Vector3();
const _fusionMid = new THREE.Vector3();
const _plasmaFireDir = new THREE.Vector3();
const fusionLinePositions = new Float32Array(6);
const fusionLineGeo = new THREE.BufferGeometry();
fusionLineGeo.setAttribute(
  'position',
  new THREE.BufferAttribute(fusionLinePositions, 3)
);
const fusionLine = new THREE.Line(
  fusionLineGeo,
  new THREE.LineBasicMaterial({ color: FUSION_LINE_COLOR })
);
fusionLine.visible = false;
fusionLine.frustumCulled = false;
scene.add(fusionLine);

/** @type {{ mat: THREE.Material, emissive: THREE.Color, emissiveIntensity: number }[]} */
let fusionPreviewGlowStack = [];
/** @type {{ mat: THREE.Material, emissive: THREE.Color, emissiveIntensity: number }[]} */
let fusionActiveGlowStack = [];

/** Objetos atrapados por el vórtice (escudo activo). */
const capturedObjects = [];
let fusionPairCursor = 0;
/** @type {null | { entryA: object, entryB: object }} */
let fusionState = null;

function getFusionPairCount(n) {
  return n >= 2 ? (n * (n - 1)) / 2 : 0;
}

function getFusionPairIndices(n, pairIdx) {
  let k = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (k === pairIdx) return [i, j];
      k++;
    }
  }
  return [0, 1];
}

function isBodyMagneticallyCaptured(body) {
  return capturedObjects.some((c) => c.body === body);
}

function applyVortexProjectileIgnorePlayer(entry) {
  if (entry.kind !== 'projectile' || !entry.projectileEnt) return;
  const pb = entry.projectileEnt.body;
  entry._vortexPlayerMaskSave = pb.collisionFilterMask;
  pb.collisionFilterMask = pb.collisionFilterMask & ~COLLISION_GROUP_PLAYER_BODY;
}

function restoreVortexProjectilePlayerCollision(entry) {
  if (entry?.kind !== 'projectile' || !entry.projectileEnt) return;
  const pb = entry.projectileEnt.body;
  if (entry._vortexPlayerMaskSave != null) {
    pb.collisionFilterMask = entry._vortexPlayerMaskSave;
    delete entry._vortexPlayerMaskSave;
  } else {
    /** Respaldo: si no hubo guardado, forzar colisión por defecto con el jugador. */
    pb.collisionFilterGroup = COLLISION_GROUP_ENEMY_PROJECTILE;
    pb.collisionFilterMask = COLLISION_MASK_ENEMY_PROJECTILE;
  }
}

/** Al soltar escudo/vórtice: quitar vuelo recto/burbuja para que solo caigan con gravedad. */
function applyMagnetReleasedProjectileFall(ent, vx, vy, vz) {
  if (!ent?.body) return;
  delete ent.enemyDir;
  delete ent.plasmaDir;
  delete ent.friendlyFlightDir;
  delete ent.friendlyFlightSpeed;
  delete ent.bubbleMode;
  delete ent.bubbleDir;
  delete ent.bubbleSpeed;
  const b = ent.body;
  b.wakeUp();
  b.angularVelocity.set(0, 0, 0);
  b.velocity.set(vx, vy, vz);
  /** Asegura golpe al jugador tras salir del vórtice (la máscara sin bit del jugador dejaba pasar la bala). */
  if (ent.state === 'enemy') {
    b.collisionFilterGroup = COLLISION_GROUP_ENEMY_PROJECTILE;
    b.collisionFilterMask = COLLISION_MASK_ENEMY_PROJECTILE;
  }
}

function isBodyInMagneticFusion(body) {
  if (!fusionState || !body) return false;
  return (
    fusionState.entryA.body === body ||
    fusionState.entryB.body === body
  );
}

function getFusionMatFromCaptureEntry(entry) {
  if (!entry) return null;
  if (entry.kind === 'cube' && entry.mesh?.material) return entry.mesh.material;
  if (entry.projectileEnt?.visualMesh?.material)
    return entry.projectileEnt.visualMesh.material;
  return null;
}

function pushFusionGlow(stack, mat, emissiveIntensity) {
  if (!mat?.emissive) return;
  const entry = {
    mat,
    emissive: mat.emissive.clone(),
    emissiveIntensity: mat.emissiveIntensity,
  };
  if (mat.color) {
    entry.color = mat.color.clone();
    mat.color.setHex(FUSION_PREVIEW_TINT);
  }
  stack.push(entry);
  mat.emissive.setHex(FUSION_PREVIEW_GLOW);
  mat.emissiveIntensity = emissiveIntensity;
  mat.needsUpdate = true;
}

function popFusionGlowStack(stack) {
  for (const s of stack) {
    if (!s.mat?.emissive) continue;
    s.mat.emissive.copy(s.emissive);
    s.mat.emissiveIntensity = s.emissiveIntensity;
    if (s.color && s.mat.color) s.mat.color.copy(s.color);
    s.mat.needsUpdate = true;
  }
  stack.length = 0;
}

function clearFusionPreviewGlow() {
  popFusionGlowStack(fusionPreviewGlowStack);
}

function clearFusionActiveGlow() {
  popFusionGlowStack(fusionActiveGlowStack);
}

function clampFusionSpawnY(y, physicsHalfExtentY) {
  const minCenterY = physicsHalfExtentY + FUSION_SPAWN_GROUND_CLEARANCE;
  return Math.max(y, minCenterY);
}

function getMagneticFusionRecipe(entryA, entryB) {
  const cubes =
    (entryA.kind === 'cube' ? 1 : 0) + (entryB.kind === 'cube' ? 1 : 0);
  const projs =
    (entryA.kind === 'projectile' ? 1 : 0) +
    (entryB.kind === 'projectile' ? 1 : 0);
  if (cubes === 2) return 'mega';
  if (projs === 2) return 'plasma';
  return 'explosive';
}

function applyFusionPairCollisionIsolation(entryA, entryB) {
  for (const entry of [entryA, entryB]) {
    const b = entry?.body;
    if (!b) continue;
    entry._fusionCollisionSave = {
      collisionFilterGroup: b.collisionFilterGroup,
      collisionFilterMask: b.collisionFilterMask,
    };
  }
  const maskA = -1 ^ COLLISION_GROUP_FUSION_B;
  const maskB = -1 ^ COLLISION_GROUP_FUSION_A;
  entryA.body.collisionFilterGroup = COLLISION_GROUP_FUSION_A;
  entryA.body.collisionFilterMask = maskA;
  entryB.body.collisionFilterGroup = COLLISION_GROUP_FUSION_B;
  entryB.body.collisionFilterMask = maskB;
}

function restoreFusionPairCollisionFromEntries(entryA, entryB) {
  for (const entry of [entryA, entryB]) {
    const b = entry?.body;
    const s = entry?._fusionCollisionSave;
    if (!b || !s) continue;
    b.collisionFilterGroup = s.collisionFilterGroup;
    b.collisionFilterMask = s.collisionFilterMask;
    delete entry._fusionCollisionSave;
  }
}

function abortMagneticFusionKeepBodies() {
  if (!fusionState) return;
  const { entryA, entryB } = fusionState;
  restoreFusionPairCollisionFromEntries(entryA, entryB);
  clearFusionActiveGlow();
  fusionState = null;
}

function removeMagneticCaptureForBody(body) {
  const idx = capturedObjects.findIndex((c) => c.body === body);
  if (idx >= 0) {
    clearVortexTransparencyIfNotGrabbed(capturedObjects[idx]);
    capturedObjects.splice(idx, 1);
  }
}

function releaseAllMagneticCapture() {
  for (const c of capturedObjects) {
    clearVortexTransparencyIfNotGrabbed(c);
    if (c.kind === 'cube' && c.body) {
      const b = c.body;
      b.wakeUp();
      b.velocity.set(0, 0, 0);
      b.angularVelocity.set(0, 0, 0);
      /** Caían “flotando” porque el vórtice movía posición cada frame y el cuerpo seguía dormido/sin caída hasta después del fixedStep. */
      b.velocity.y = -1.8;
    } else if (c.kind === 'projectile' && c.projectileEnt) {
      /** Sin esto siguen con enemyDir / burbuja y enforce las acelera en línea recta. */
      applyMagnetReleasedProjectileFall(c.projectileEnt, 0, -2.2, 0);
    }
  }
  capturedObjects.length = 0;
  fusionPairCursor = 0;
  fusionLine.visible = false;
  clearFusionPreviewGlow();
}

function getVortexWorldPoint(out) {
  out.copy(camera.position);
  out.addScaledVector(_shieldNormal, VORTEX_DIST);
  out.y += -0.12;
  return out;
}

/** Clic derecho con escudo: lanza todo el vórtice hacia la mira (mismo criterio que telequinesis al soltar). */
function launchVortexContentsAlongAim(dir) {
  const inv = dir.length();
  if (inv < 1e-6) return;
  const nx = dir.x / inv;
  const ny = dir.y / inv;
  const nz = dir.z / inv;
  const list = capturedObjects.slice();
  capturedObjects.length = 0;
  fusionPairCursor = 0;
  fusionLine.visible = false;
  clearFusionPreviewGlow();

  const projSpeed = LAUNCH_SPEED * LAUNCH_PROJECTILE_MULT;
  const cubeSpeed = LAUNCH_SPEED;
  const now = performance.now();

  for (const c of list) {
    if (!c.body || grabbedBody === c.body) continue;
    clearVortexTransparencyIfNotGrabbed(c);
    const b = c.body;
    b.wakeUp();
    if (c.kind === 'cube' && c.mesh) {
      c.mesh.userData.vortexImmuneUntil = now + VORTEX_LAUNCH_IMMUNE_MS;
      b.velocity.set(nx * cubeSpeed, ny * cubeSpeed, nz * cubeSpeed);
      b.angularVelocity.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      );
    } else if (c.kind === 'projectile' && c.projectileEnt) {
      const pe = c.projectileEnt;
      if (pe.dead) continue;
      pe.pathTraveled = 0;
      pe.age = 0;
      delete pe.bubbleMode;
      delete pe.bubbleDir;
      delete pe.bubbleSpeed;
      pe.vortexImmuneUntil = now + VORTEX_LAUNCH_IMMUNE_MS;
      if (pe.plasmaDir) {
        pe.plasmaDir = { x: nx, y: ny, z: nz };
        b.velocity.set(
          nx * PROJ_PLASMA_SPEED,
          ny * PROJ_PLASMA_SPEED,
          nz * PROJ_PLASMA_SPEED
        );
      } else {
        if (pe.state === 'enemy') captureProjectileVisual(pe);
        pe.friendlyFlightDir = { x: nx, y: ny, z: nz };
        pe.friendlyFlightSpeed = projSpeed;
        b.velocity.set(nx * projSpeed, ny * projSpeed, nz * projSpeed);
      }
      b.angularVelocity.set(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      );
    }
  }
}

function removeCubeMesh(mesh) {
  if (!mesh?.userData?.body) return;
  removeMagneticCaptureForBody(mesh.userData.body);
  const idx = cubeMeshes.indexOf(mesh);
  if (idx < 0) return;
  cubeMeshes.splice(idx, 1);
  world.removeBody(mesh.userData.body);
  mesh.material.dispose();
  scene.remove(mesh);
}

function addExplosiveCube(x, y, z) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xb89a1e,
    emissive: 0xffee44,
    emissiveIntensity: 1.85,
    metalness: 0.28,
    roughness: 0.38,
  });
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  mesh.userData.isExplosiveCube = true;
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
  setupExplosiveCubeDetonation(mesh);
  return mesh;
}

function detonateExplosiveCube(mesh) {
  if (!mesh?.userData?.isExplosiveCube || mesh.userData._exploded) return;
  mesh.userData._exploded = true;
  const p = mesh.userData.body.position;
  killDronesInSphere(p.x, p.y, p.z, EXPLOSIVE_CUBE_BLAST_RADIUS, true);
  removeCubeMesh(mesh);
}

function setupExplosiveCubeDetonation(mesh) {
  const body = mesh.userData.body;
  mesh.userData.explosiveArmAt = performance.now() + EXPLOSIVE_ARM_DELAY_MS;
  const onCollide = (e) => {
    if (mesh.userData._exploded) return;
    if (performance.now() < mesh.userData.explosiveArmAt) return;
    const other = e.body;
    if (other === playerBody) return;
    const v = body.velocity.length();
    const hitDrone = drones.some((d) => !d.dying && d.body === other);
    const hitGround = other === groundBody;
    const hitCube = cubeMeshes.some(
      (m) => m !== mesh && m.userData.body === other
    );
    if (hitDrone) {
      detonateExplosiveCube(mesh);
      body.removeEventListener('collide', onCollide);
      return;
    }
    if (hitGround && v >= EXPLOSIVE_DETONATE_SPEED) {
      detonateExplosiveCube(mesh);
      body.removeEventListener('collide', onCollide);
      return;
    }
    if (hitCube && v > 9) {
      detonateExplosiveCube(mesh);
      body.removeEventListener('collide', onCollide);
    }
  };
  body.addEventListener('collide', onCollide);
}

function addMegaBlock(x, y, z) {
  const mat = new THREE.MeshStandardMaterial({
    color: MEGA_CUBE_COLOR,
    emissive: 0x223355,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    roughness: 0.42,
  });
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(x, y, z);
  mesh.scale.setScalar(MEGA_CUBE_HALF * 2);
  mesh.userData.isMegaCube = true;
  scene.add(mesh);

  const shape = new CANNON.Box(
    new CANNON.Vec3(MEGA_CUBE_HALF, MEGA_CUBE_HALF, MEGA_CUBE_HALF)
  );
  const body = new CANNON.Body({
    mass: MEGA_CUBE_MASS,
    linearDamping: 0.06,
    angularDamping: 0.18,
    position: new CANNON.Vec3(x, y, z),
  });
  body.addShape(shape);
  world.addBody(body);

  mesh.userData.body = body;
  mesh.userData.isGrabbable = true;
  body.userData = { isCube: true };
  cubeMeshes.push(mesh);
  return mesh;
}

function tryStartMagneticFusion() {
  if (fusionState || isPaused || !controls.isLocked) return;
  const n = capturedObjects.length;
  if (n < 2) return;
  const nPairs = getFusionPairCount(n);
  if (nPairs < 1) return;
  const idx = fusionPairCursor % nPairs;
  const [i, j] = getFusionPairIndices(n, idx);
  const hi = Math.max(i, j);
  const lo = Math.min(i, j);
  const entryB = capturedObjects[hi];
  const entryA = capturedObjects[lo];
  capturedObjects.splice(hi, 1);
  capturedObjects.splice(lo, 1);
  clearVortexTransparencyIfNotGrabbed(entryA);
  clearVortexTransparencyIfNotGrabbed(entryB);

  _fusionMid.set(
    (entryA.body.position.x + entryB.body.position.x) * 0.5,
    (entryA.body.position.y + entryB.body.position.y) * 0.5,
    (entryA.body.position.z + entryB.body.position.z) * 0.5
  );
  clearFusionPreviewGlow();
  clearFusionActiveGlow();
  const ma = getFusionMatFromCaptureEntry(entryA);
  const mb = getFusionMatFromCaptureEntry(entryB);
  if (ma) {
    pushFusionGlow(
      fusionActiveGlowStack,
      ma,
      entryA.kind === 'cube'
        ? FUSION_PREVIEW_INTENSITY_CUBE
        : FUSION_PREVIEW_INTENSITY_PROJ
    );
  }
  if (mb) {
    pushFusionGlow(
      fusionActiveGlowStack,
      mb,
      entryB.kind === 'cube'
        ? FUSION_PREVIEW_INTENSITY_CUBE
        : FUSION_PREVIEW_INTENSITY_PROJ
    );
  }
  fusionState = { entryA, entryB };
  applyFusionPairCollisionIsolation(entryA, entryB);
}

function completeMagneticFusion(entryA, entryB) {
  const recipe = getMagneticFusionRecipe(entryA, entryB);
  const x = _fusionMid.x;
  const y = _fusionMid.y;
  const z = _fusionMid.z;

  clearFusionActiveGlow();
  clearFusionPreviewGlow();

  if (entryA.kind === 'cube') {
    removeCubeMesh(entryA.mesh);
  } else if (entryA.projectileEnt && !entryA.projectileEnt.dead) {
    removeProjectile(entryA.projectileEnt);
  }

  if (entryB.kind === 'cube') {
    removeCubeMesh(entryB.mesh);
  } else if (entryB.projectileEnt && !entryB.projectileEnt.dead) {
    removeProjectile(entryB.projectileEnt);
  }

  if (recipe === 'plasma') {
    const heldPe = grabbedBody?.userData?.projectileEnt;
    if (
      heldPe?.plasmaDir &&
      !heldPe.dead &&
      heldPe.body === grabbedBody
    ) {
      growPlasmaProjectile(heldPe);
      applyGrabTransparency(heldPe.visualMesh, GRAB_PLASMA_HELD_OPACITY);
      physicsTimeScale = 1;
      clearGrabGlow();
      handExtendedUntil = performance.now() + HAND_EXTENDED_MS * 0.65;
      handShakeX += (Math.random() - 0.5) * 6;
      handShakeY += (Math.random() - 0.5) * 6;
      return;
    }
    camera.getWorldDirection(_plasmaFireDir);
    if (_plasmaFireDir.lengthSq() < 1e-6) {
      _plasmaFireDir.set(0, 0, -1);
    } else {
      _plasmaFireDir.normalize();
    }
    const plasmaEnt = createPlasmaBolt(
      x,
      y,
      z,
      _plasmaFireDir.x,
      _plasmaFireDir.y,
      _plasmaFireDir.z,
      true
    );
    grabbedBody = plasmaEnt.body;
    applyGrabTransparency(plasmaEnt.visualMesh, GRAB_PLASMA_HELD_OPACITY);
    physicsTimeScale = 1;
    clearGrabGlow();
    return;
  }

  let mesh;
  if (recipe === 'mega') {
    mesh = addMegaBlock(x, clampFusionSpawnY(y, MEGA_CUBE_HALF), z);
  } else {
    mesh = addExplosiveCube(x, clampFusionSpawnY(y, 0.5), z);
  }
  const body = mesh.userData.body;
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  grabbedBody = body;
  applyGrabTransparency(mesh);
  physicsTimeScale = 1;
  clearGrabGlow();
}

function updateMagneticFusion(dt) {
  if (!fusionState) return;
  const { entryA, entryB } = fusionState;
  const ba = entryA.body;
  const bb = entryB.body;
  if (!ba || !bb) {
    abortMagneticFusionKeepBodies();
    return;
  }

  _fusionMid.set(
    (ba.position.x + bb.position.x) * 0.5,
    (ba.position.y + bb.position.y) * 0.5,
    (ba.position.z + bb.position.z) * 0.5
  );

  const step = FUSION_SPEED * dt;
  for (const b of [ba, bb]) {
    const dx = _fusionMid.x - b.position.x;
    const dy = _fusionMid.y - b.position.y;
    const dz = _fusionMid.z - b.position.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 1e-5) {
      const m = Math.min(step, d);
      b.position.x += (dx / d) * m;
      b.position.y += (dy / d) * m;
      b.position.z += (dz / d) * m;
    }
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
  }

  const ox = ba.position.x - bb.position.x;
  const oy = ba.position.y - bb.position.y;
  const oz = ba.position.z - bb.position.z;
  if (ox * ox + oy * oy + oz * oz < FUSION_MERGE_DIST * FUSION_MERGE_DIST) {
    completeMagneticFusion(entryA, entryB);
    fusionState = null;
  }
}

function updateMagneticFusionLine() {
  clearFusionPreviewGlow();
  if (fusionState || capturedObjects.length < 2) {
    fusionLine.visible = false;
    return;
  }
  const n = capturedObjects.length;
  const nPairs = getFusionPairCount(n);
  if (nPairs < 1) {
    fusionLine.visible = false;
    return;
  }
  const [i, j] = getFusionPairIndices(n, fusionPairCursor % nPairs);
  const ea = capturedObjects[i];
  const eb = capturedObjects[j];
  const pa = ea.body.position;
  const pb = eb.body.position;
  fusionLinePositions[0] = pa.x;
  fusionLinePositions[1] = pa.y;
  fusionLinePositions[2] = pa.z;
  fusionLinePositions[3] = pb.x;
  fusionLinePositions[4] = pb.y;
  fusionLinePositions[5] = pb.z;
  fusionLineGeo.attributes.position.needsUpdate = true;
  fusionLine.visible = true;
  const mia = getFusionMatFromCaptureEntry(ea);
  const mib = getFusionMatFromCaptureEntry(eb);
  if (mia) {
    pushFusionGlow(
      fusionPreviewGlowStack,
      mia,
      ea.kind === 'cube'
        ? FUSION_PREVIEW_INTENSITY_CUBE
        : FUSION_PREVIEW_INTENSITY_PROJ
    );
  }
  if (mib) {
    pushFusionGlow(
      fusionPreviewGlowStack,
      mib,
      eb.kind === 'cube'
        ? FUSION_PREVIEW_INTENSITY_CUBE
        : FUSION_PREVIEW_INTENSITY_PROJ
    );
  }
}

function applyMagneticWebVisualJitter(timeMs) {
  if (!shieldPressed || capturedObjects.length === 0) return;
  const t = timeMs * 0.001;
  let k = 0;
  for (const c of capturedObjects) {
    const ph = t * 10.2 + k * 2.1;
    const jx = Math.sin(ph) * VORTEX_JITTER_AMP;
    const jy = Math.cos(ph * 1.13) * VORTEX_JITTER_AMP;
    const jz = Math.sin(ph * 0.91 + 0.7) * VORTEX_JITTER_AMP;
    k++;
    const b = c.body;
    if (c.kind === 'cube' && c.mesh) {
      c.mesh.position.set(b.position.x + jx, b.position.y + jy, b.position.z + jz);
      c.mesh.quaternion.copy(b.quaternion);
    } else if (c.projectileEnt) {
      const g = c.projectileEnt.group;
      g.position.set(b.position.x + jx, b.position.y + jy, b.position.z + jz);
      g.quaternion.copy(b.quaternion);
    }
  }
}

function updateMagneticVortex(dt) {
  if (isPaused || !controls.isLocked) {
    releaseAllMagneticCapture();
    return;
  }
  if (!shieldPressed) {
    releaseAllMagneticCapture();
    return;
  }

  computeShieldFrame();
  getVortexWorldPoint(_vortexPt);

  for (let i = capturedObjects.length - 1; i >= 0; i--) {
    const c = capturedObjects[i];
    const b = c.body;
    if (
      grabbedBody === b ||
      (c.projectileEnt &&
        (c.projectileEnt.dead ||
          c.projectileEnt.shieldStuck ||
          c.projectileEnt.shieldDropping))
    ) {
      clearVortexTransparencyIfNotGrabbed(c);
      capturedObjects.splice(i, 1);
      continue;
    }
    const dx = b.position.x - _vortexPt.x;
    const dy = b.position.y - _vortexPt.y;
    const dz = b.position.z - _vortexPt.z;
    if (dx * dx + dy * dy + dz * dz > VORTEX_RADIUS * VORTEX_RADIUS) {
      clearVortexTransparencyIfNotGrabbed(c);
      capturedObjects.splice(i, 1);
    }
  }

  if (!fusionState) {
    const vortexR2 = VORTEX_RADIUS * VORTEX_RADIUS;
    const candidates = [];

    for (const mesh of cubeMeshes) {
      const b = mesh.userData.body;
      if (!b || grabbedBody === b) continue;
      if (
        mesh.userData.vortexImmuneUntil &&
        performance.now() < mesh.userData.vortexImmuneUntil
      ) {
        continue;
      }
      if (isBodyMagneticallyCaptured(b)) continue;
      const dx = b.position.x - _vortexPt.x;
      const dy = b.position.y - _vortexPt.y;
      const dz = b.position.z - _vortexPt.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= vortexR2) {
        candidates.push({
          distSq: d2,
          entry: { kind: 'cube', body: b, mesh },
        });
      }
    }

    for (const ent of enemyProjectiles) {
      if (ent.dead || grabbedBody === ent.body) continue;
      if (ent.plasmaDir) continue;
      if (ent.shieldStuck || ent.shieldDropping) continue;
      if (
        ent.vortexImmuneUntil &&
        performance.now() < ent.vortexImmuneUntil
      ) {
        continue;
      }
      if (isBodyMagneticallyCaptured(ent.body)) continue;
      const b = ent.body;
      const dx = b.position.x - _vortexPt.x;
      const dy = b.position.y - _vortexPt.y;
      const dz = b.position.z - _vortexPt.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 <= vortexR2) {
        candidates.push({
          distSq: d2,
          entry: {
            kind: 'projectile',
            body: b,
            mesh: ent.group,
            projectileEnt: ent,
          },
        });
      }
    }

    candidates.sort((a, b) => a.distSq - b.distSq);
    for (const { entry } of candidates) {
      if (capturedObjects.length >= VORTEX_MAX_CAPTURED) break;
      capturedObjects.push(entry);
      if (entry.kind === 'cube') {
        applyGrabTransparency(entry.mesh);
      } else if (entry.projectileEnt?.visualMesh) {
        applyVortexProjectileIgnorePlayer(entry);
        applyGrabTransparency(
          entry.projectileEnt.visualMesh,
          GRAB_PROJECTILE_VORTEX_OPACITY
        );
      }
    }
  }

  const n = capturedObjects.length;
  const t = Math.min(1, VORTEX_LERP * dt);
  for (let i = 0; i < n; i++) {
    const b = capturedObjects[i].body;
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    _vortexSlot
      .copy(_vortexPt)
      .addScaledVector(_shieldBasisRight, Math.cos(angle) * VORTEX_ORBIT_R)
      .addScaledVector(_shieldBasisUp, Math.sin(angle) * VORTEX_ORBIT_R);
    b.position.x += (_vortexSlot.x - b.position.x) * t;
    b.position.y += (_vortexSlot.y - b.position.y) * t;
    b.position.z += (_vortexSlot.z - b.position.z) * t;
    b.velocity.set(0, 0, 0);
    b.angularVelocity.x *= 0.82;
    b.angularVelocity.y *= 0.82;
    b.angularVelocity.z *= 0.82;
  }
}

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

function isArenaWallBody(body) {
  return Boolean(body?.userData?.isArenaWall);
}

/** Proyectiles de fusión (burbuja / plasma / telequinesis) o burbuja enemiga. */
function isFusionExplosionProjectile(ent) {
  if (!ent || ent.dead || grabbedBody === ent.body) return false;
  if (ent.shieldStuck || ent.shieldDropping) return false;
  if (ent.state === 'friendly') {
    return Boolean(ent.bubbleMode || ent.plasmaDir || ent.friendlyFlightDir);
  }
  if (ent.state === 'enemy') {
    return Boolean(ent.bubbleMode);
  }
  return false;
}

const fusionExplosionTriggers = [];
const fusionParticleBursts = [];
const fusionExplosionLights = [];
let fusionCameraShake = { x: 0, y: 0, z: 0 };
addEliteCombatShake = (amp = 0.55) => {
  fusionCameraShake.x += (Math.random() - 0.5) * 2 * amp;
  fusionCameraShake.y += (Math.random() - 0.5) * 1.2 * amp;
  fusionCameraShake.z += (Math.random() - 0.5) * 2 * amp;
};
/** Esfera invisible (solo THREE): escala con el radio del barrido de daño. */
const COMBO_EXPLOSION_PROBE_GEO = new THREE.SphereGeometry(1, 22, 16);
const COMBO_EXPLOSION_PROBE_MAT = new THREE.MeshBasicMaterial({
  visible: false,
});

function spawnFusionExplosionEffects(x, y, z, impactSpeed = 24) {
  killDronesInSphere(x, y, z, 1.2, true);
  const probe = new THREE.Mesh(COMBO_EXPLOSION_PROBE_GEO, COMBO_EXPLOSION_PROBE_MAT);
  probe.visible = false;
  probe.position.set(x, y, z);
  probe.scale.setScalar(1.2);
  scene.add(probe);
  fusionExplosionTriggers.push({
    t: 0,
    x,
    y,
    z,
    maxR: FUSION_EXPLOSION_TRIGGER_MAX_RADIUS,
    duration: FUSION_EXPLOSION_TRIGGER_DURATION,
    probe,
  });

  const n = FUSION_EXPLOSION_PARTICLE_COUNT;
  const positions = new Float32Array(n * 3);
  const velocities = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * Math.PI * 2;
    const phi = Math.acos(2 * v - 1);
    const sx = Math.sin(phi) * Math.cos(theta);
    const sy = Math.sin(phi) * Math.sin(theta);
    const sz = Math.cos(phi);
    const spd = 5 + Math.random() * 16;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocities[i * 3] = sx * spd;
    velocities[i * 3 + 1] = sy * spd;
    velocities[i * 3 + 2] = sz * spd;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffee22,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  fusionParticleBursts.push({
    points,
    geo,
    mat,
    velocities,
    age: 0,
    life: FUSION_EXPLOSION_PARTICLE_LIFE,
  });

  const light = new THREE.PointLight(0xffdd33, 36, 52);
  light.position.set(x, y, z);
  scene.add(light);
  fusionExplosionLights.push({ light, age: 0 });

  const amp =
    FUSION_EXPLOSION_SHAKE_BASE *
    THREE.MathUtils.clamp(impactSpeed / 28, 0.35, 1.4);
  fusionCameraShake.x += (Math.random() - 0.5) * 2 * amp;
  fusionCameraShake.y += (Math.random() - 0.5) * 1.2 * amp;
  fusionCameraShake.z += (Math.random() - 0.5) * 2 * amp;
}

function updateFusionExplosionTriggers(dt) {
  if (isPaused) return;
  for (let i = fusionExplosionTriggers.length - 1; i >= 0; i--) {
    const tr = fusionExplosionTriggers[i];
    tr.t += dt;
    const r = Math.min(
      tr.maxR,
      (tr.t / tr.duration) * tr.maxR
    );
    killDronesInSphere(tr.x, tr.y, tr.z, r, true);
    if (tr.probe) {
      tr.probe.position.set(tr.x, tr.y, tr.z);
      tr.probe.scale.setScalar(Math.max(0.02, r));
    }
    if (tr.t >= tr.duration) {
      if (tr.probe) {
        scene.remove(tr.probe);
      }
      fusionExplosionTriggers.splice(i, 1);
    }
  }
}

function updateFusionParticleBursts(dt) {
  for (let i = fusionParticleBursts.length - 1; i >= 0; i--) {
    const b = fusionParticleBursts[i];
    b.age += dt;
    const pos = b.geo.attributes.position.array;
    const v = b.velocities;
    const n = FUSION_EXPLOSION_PARTICLE_COUNT;
    for (let k = 0; k < n; k++) {
      pos[k * 3] += v[k * 3] * dt;
      pos[k * 3 + 1] += v[k * 3 + 1] * dt;
      pos[k * 3 + 2] += v[k * 3 + 2] * dt;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.mat.opacity = Math.max(0, 1 - b.age / b.life);
    if (b.age >= b.life) {
      scene.remove(b.points);
      b.geo.dispose();
      b.mat.dispose();
      fusionParticleBursts.splice(i, 1);
    }
  }
}

function updateFusionExplosionLights(dt) {
  for (let i = fusionExplosionLights.length - 1; i >= 0; i--) {
    const L = fusionExplosionLights[i];
    L.age += dt;
    const t = L.age / FUSION_EXPLOSION_LIGHT_DURATION;
    L.light.intensity = 32 * Math.max(0, 1 - t);
    if (L.age >= FUSION_EXPLOSION_LIGHT_DURATION) {
      scene.remove(L.light);
      L.light.dispose();
      fusionExplosionLights.splice(i, 1);
    }
  }
}

function fuseProjectileExplode(ent) {
  if (!ent || ent.dead) return;
  const p = ent.body.position;
  const vx = ent.body.velocity.x;
  const vy = ent.body.velocity.y;
  const vz = ent.body.velocity.z;
  const sp = Math.hypot(vx, vy, vz);
  spawnFusionExplosionEffects(p.x, p.y, p.z, sp);
  removeProjectile(ent);
}

/**
 * Rebote tipo burbuja: pierde energía, velocidad acotada, dirección con variación aleatoria.
 * @returns {'graze'|'bounced'}
 */
function applyExplosiveBubbleBarrierBounce(ent, nx, ny, nz, restitution) {
  const b = ent.body;
  const nlen = Math.hypot(nx, ny, nz);
  if (nlen < 1e-6) return 'graze';
  const nnx = nx / nlen;
  const nny = ny / nlen;
  const nnz = nz / nlen;
  const vx = b.velocity.x;
  const vy = b.velocity.y;
  const vz = b.velocity.z;
  const vn = vx * nnx + vy * nny + vz * nnz;
  /** Solo ignorar si ya se separa de la superficie (antes “graze” fallaba y el rayo seguía clavado en la pared). */
  if (vn > 0.06) return 'graze';
  const e = restitution;
  let ox = vx - (1 + e) * vn * nnx;
  let oy = vy - (1 + e) * vn * nny;
  let oz = vz - (1 + e) * vn * nnz;
  ox += (Math.random() - 0.5) * BUBBLE_RANDOM_IMPULSE;
  oy += (Math.random() - 0.5) * BUBBLE_RANDOM_IMPULSE;
  oz += (Math.random() - 0.5) * BUBBLE_RANDOM_IMPULSE;
  const rawLen = Math.hypot(ox, oy, oz);
  if (rawLen < 1e-5) {
    ox = nnx;
    oy = Math.abs(nny) > 0.9 ? 0 : 1;
    oz = nnz;
  }
  const il = Math.hypot(ox, oy, oz);
  const invl = il > 1e-6 ? 1 / il : 1;
  let dx = ox * invl;
  let dy = oy * invl;
  let dz = oz * invl;
  let sp = rawLen * BUBBLE_SPEED_RETENTION;
  sp = THREE.MathUtils.clamp(sp, BUBBLE_MIN_SPEED, BUBBLE_MAX_SPEED);
  delete ent.enemyDir;
  delete ent.plasmaDir;
  delete ent.friendlyFlightDir;
  delete ent.friendlyFlightSpeed;
  ent.bubbleMode = true;
  ent.bubbleDir = { x: dx, y: dy, z: dz };
  ent.bubbleSpeed = sp;
  ent.pathTraveled = 0;
  b.velocity.set(dx * sp, dy * sp, dz * sp);
  b.angularVelocity.set(0, 0, 0);
  return 'bounced';
}

function tryBubbleBounceFromContact(ent, contact, restitution) {
  if (!contact?.ni) return 'graze';
  const nx = -contact.ni.x;
  const ny = -contact.ni.y;
  const nz = -contact.ni.z;
  return applyExplosiveBubbleBarrierBounce(ent, nx, ny, nz, restitution);
}

function getProjectileSphereRadius(ent) {
  const sh = ent.body.shapes?.[0];
  if (sh && typeof sh.radius === 'number') return sh.radius;
  return PROJ_RADIUS;
}

/**
 * Si el solver “salta” la pared a alta velocidad, empuja el centro al límite interior y aplica rebote.
 * Va antes de enforceEnemyProjectileStraightFlight (postStep).
 */
function resolveProjectileArenaTunneling() {
  for (const ent of enemyProjectiles) {
    if (ent.dead) continue;
    if (grabbedBody === ent.body) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;
    if (isBodyMagneticallyCaptured(ent.body)) continue;
    if (isBodyInMagneticFusion(ent.body)) continue;

    const r = getProjectileSphereRadius(ent);
    const pad = 0.06;
    const lim = ARENA_HALF - r - pad;
    const p = ent.body.position;
    let nx = 0;
    let nz = 0;
    let moved = false;

    if (p.x > lim) {
      p.x = lim;
      nx -= 1;
      moved = true;
    } else if (p.x < -lim) {
      p.x = -lim;
      nx += 1;
      moved = true;
    }
    if (p.z > lim) {
      p.z = lim;
      nz -= 1;
      moved = true;
    } else if (p.z < -lim) {
      p.z = -lim;
      nz += 1;
      moved = true;
    }

    if (!moved) continue;

    const nh = Math.hypot(nx, nz);
    if (nh < 1e-6) continue;
    if (isFusionExplosionProjectile(ent)) {
      fuseProjectileExplode(ent);
      continue;
    }
    applyExplosiveBubbleBarrierBounce(
      ent,
      nx / nh,
      0,
      nz / nh,
      BUBBLE_WALL_RESTITUTION
    );
  }
}

function captureProjectileVisual(ent) {
  ent.state = 'friendly';
  ent.pathTraveled = 0;
  delete ent.bubbleMode;
  delete ent.bubbleDir;
  delete ent.bubbleSpeed;
  delete ent.enemyDir;
  delete ent.friendlyFlightDir;
  delete ent.friendlyFlightSpeed;
  const mat = ent.visualMesh.material;
  mat.color.setHex(0x22eeff);
  mat.emissive.setHex(0x00ccff);
  mat.emissiveIntensity = 2.1;
  mat.needsUpdate = true;
}

function onProjectileCollide(ent, other, contact) {
  if (!ent || ent.dead) return;

  const drone = drones.find((d) => !d.dying && d.body === other);
  if (drone) {
    // Solo balas aliadas (del jugador) matan drones; las enemigas los ignoran.
    if (ent.state === 'friendly' && !ent.shieldStuck) {
      killDrone(drone);
      fuseProjectileExplode(ent);
    }
    return;
  }

  if (other === groundBody && ent.state === 'enemy') {
    if (ent.shieldStuck) return;
    if (isFusionExplosionProjectile(ent)) {
      fuseProjectileExplode(ent);
      return;
    }
    tryBubbleBounceFromContact(ent, contact, BUBBLE_GROUND_RESTITUTION);
    return;
  }
  if (ent.state === 'enemy' && isArenaWallBody(other)) {
    if (ent.shieldStuck) return;
    if (isFusionExplosionProjectile(ent)) {
      fuseProjectileExplode(ent);
      return;
    }
    tryBubbleBounceFromContact(ent, contact, BUBBLE_WALL_RESTITUTION);
    return;
  }
  if (other === playerBody && ent.state === 'enemy') {
    if (ent.shieldStuck) return;
    if (isBodyMagneticallyCaptured(ent.body)) return;
    if (
      ent.shieldDropping &&
      performance.now() < (ent.shieldDropPlayerImmuneUntil ?? 0)
    ) {
      return;
    }
    removeProjectile(ent);
    onPlayerHit();
    return;
  }
  if (ent.state === 'friendly') {
    if (other === playerBody) return;
    if (other === groundBody) {
      if (isFusionExplosionProjectile(ent)) {
        fuseProjectileExplode(ent);
        return;
      }
      tryBubbleBounceFromContact(ent, contact, BUBBLE_GROUND_RESTITUTION);
      return;
    }
    if (isArenaWallBody(other)) {
      if (isFusionExplosionProjectile(ent)) {
        fuseProjectileExplode(ent);
        return;
      }
      tryBubbleBounceFromContact(ent, contact, BUBBLE_WALL_RESTITUTION);
      return;
    }
    const cubeHit = cubeMeshes.find((m) => m.userData.body === other);
    if (cubeHit && isFusionExplosionProjectile(ent)) {
      const sp = ent.body.velocity.length();
      if (sp >= FUSION_IMPACT_MIN_SPEED_CUBE) {
        fuseProjectileExplode(ent);
        return;
      }
    }
  }
}

function applyProjectileShieldStuckVisual(ent) {
  const mat = ent.visualMesh.material;
  if (!ent.shieldStuckMatSave) {
    ent.shieldStuckMatSave = {
      opacity: mat.opacity,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite,
      emissiveIntensity: mat.emissiveIntensity,
    };
  }
  mat.transparent = true;
  mat.opacity = SHIELD_STUCK_PROJ_OPACITY;
  mat.depthWrite = false;
  mat.emissiveIntensity =
    ent.shieldStuckMatSave.emissiveIntensity * SHIELD_STUCK_PROJ_EMISSIVE_MULT;
  mat.needsUpdate = true;
}

function restoreProjectileShieldStuckVisual(ent) {
  const s = ent.shieldStuckMatSave;
  if (!s) return;
  const mat = ent.visualMesh.material;
  mat.opacity = s.opacity;
  mat.transparent = s.transparent;
  mat.depthWrite = s.depthWrite;
  mat.emissiveIntensity = s.emissiveIntensity;
  delete ent.shieldStuckMatSave;
  mat.needsUpdate = true;
}

function releaseShieldStuckProjectiles() {
  computeShieldFrame();
  for (const ent of enemyProjectiles) {
    if (!ent.shieldStuck) continue;
    restoreProjectileShieldStuckVisual(ent);
    ent.shieldStuck = false;
    ent.shieldDropping = true;
    ent.shieldDropSec = SHIELD_DROP_SEC;
    /** Evita daño al soltar: la bala estaba en el plano del escudo y solapa la hitbox del jugador. */
    ent.shieldDropPlayerImmuneUntil = performance.now() + 520;
    delete ent.enemyDir;
    delete ent.shieldStickU;
    delete ent.shieldStickV;
    const b = ent.body;
    /** Empujar hacia delante (hacia la mira) para separar del centro del jugador. */
    const push = 0.58;
    b.position.x += _shieldNormal.x * push;
    b.position.y += _shieldNormal.y * push;
    b.position.z += _shieldNormal.z * push;
    applyMagnetReleasedProjectileFall(
      ent,
      _shieldNormal.x * 0.35,
      -2.2,
      _shieldNormal.z * 0.35
    );
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

function createEnemyProjectile(ox, oy, oz, tx, ty, tz, opts = {}) {
  const speedMult = opts.speedMult ?? 1;
  const jitter = opts.jitter ?? 0;
  let jtx = tx;
  let jty = ty;
  let jtz = tz;
  if (jitter > 0) {
    jtx += (Math.random() - 0.5) * 2 * jitter;
    jty += (Math.random() - 0.5) * 2 * jitter;
    jtz += (Math.random() - 0.5) * 2 * jitter;
  }
  const dx = jtx - ox;
  const dy = jty - oy;
  const dz = jtz - oz;
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
    collisionFilterGroup: COLLISION_GROUP_ENEMY_PROJECTILE,
    collisionFilterMask: COLLISION_MASK_ENEMY_PROJECTILE,
  });
  body.addShape(shape);

  const sp = PROJ_ENEMY_SPEED * speedMult;
  body.velocity.set(nx * sp, ny * sp, nz * sp);

  const ent = {
    group,
    visualMesh,
    pickMesh,
    body,
    state: 'enemy',
    age: 0,
    pathTraveled: 0,
    dead: false,
    /** Multiplicador respecto a PROJ_ENEMY_SPEED (disparos élite / tuning). */
    enemySpeedScale: speedMult,
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
    onProjectileCollide(ent, e.body, e.contact);
  });

  world.addBody(body);
  projectileMeshes.push(group);
  enemyProjectiles.push(ent);
  return ent;
}
createEnemyProjectileRef = createEnemyProjectile;

function applyPlasmaTierToBody(ent) {
  const tier = Math.min(
    Math.max(1, ent.plasmaTier || 1),
    PLASMA_MAX_TIER
  );
  ent.plasmaTier = tier;
  const t = tier - 1;
  const r = PROJ_RADIUS * Math.pow(PLASMA_RADIUS_GROWTH, t);
  const visScale =
    PROJ_VISUAL_SCALE * 1.15 * (1 + PLASMA_VISUAL_GROW_PER_TIER * t);
  ent.visualMesh.scale.setScalar(visScale);
  ent.pickMesh.scale.setScalar(1 + PLASMA_PICK_SCALE_PER_TIER * t);

  const body = ent.body;
  while (body.shapes.length > 0) {
    body.removeShape(body.shapes[0]);
  }
  body.addShape(new CANNON.Sphere(r));
  body.mass = PROJ_MASS * 0.9 * Math.pow(1.055, t);
  body.updateMassProperties();
}

function growPlasmaProjectile(ent) {
  ent.plasmaTier = Math.min(
    (ent.plasmaTier || 1) + 1,
    PLASMA_MAX_TIER
  );
  ent.plasmaPierceLeft += PLASMA_PIERCE_PER_STACK;
  applyPlasmaTierToBody(ent);
  const mat = ent.visualMesh.material;
  mat.emissiveIntensity = Math.min(
    5.8,
    3.4 + 0.24 * (ent.plasmaTier - 1)
  );
  mat.needsUpdate = true;
}

/** Fusión bala+bala: vuelo rápido hasta el 1.er rebote; luego burbuja como el resto. */
function createPlasmaBolt(x, y, z, dx, dy, dz, holdInHand = false) {
  let dist = Math.hypot(dx, dy, dz);
  let nx;
  let ny;
  let nz;
  if (dist < 1e-5) {
    nx = 0;
    ny = 0;
    nz = -1;
    dist = 1;
  } else {
    nx = dx / dist;
    ny = dy / dist;
    nz = dz / dist;
  }

  const mat = new THREE.MeshStandardMaterial({
    color: 0x7affee,
    emissive: 0x00ffcc,
    emissiveIntensity: 3.4,
    metalness: 0.42,
    roughness: 0.22,
  });
  const visualMesh = new THREE.Mesh(projGeo, mat);
  visualMesh.scale.setScalar(PROJ_VISUAL_SCALE * 1.15);
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
    mass: PROJ_MASS * 0.9,
    linearDamping: 0,
    angularDamping: 0.25,
    position: new CANNON.Vec3(x, y, z),
    collisionResponse: true,
    collisionFilterGroup: 1,
    collisionFilterMask: COLLISION_MASK_ENEMY_PROJECTILE,
  });
  body.addShape(shape);

  if (holdInHand) {
    body.velocity.set(0, 0, 0);
  } else {
    body.velocity.set(
      nx * PROJ_PLASMA_SPEED,
      ny * PROJ_PLASMA_SPEED,
      nz * PROJ_PLASMA_SPEED
    );
  }

  const ent = {
    group,
    visualMesh,
    pickMesh,
    body,
    state: 'friendly',
    age: 0,
    pathTraveled: 0,
    dead: false,
    plasmaDir: { x: nx, y: ny, z: nz },
    plasmaPierceLeft: PROJ_PLASMA_PIERCE_COUNT,
    plasmaTier: 1,
  };
  new EnemyBullet(ent);

  body.userData = { projectileEnt: ent };
  applyPlasmaTierToBody(ent);

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
    onProjectileCollide(ent, e.body, e.contact);
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
    if (isBodyInMagneticFusion(ent.body)) {
      continue;
    }
    if (ent.shieldStuck) {
      continue;
    }
    if (isBodyMagneticallyCaptured(ent.body)) {
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
    const escapeR =
      ARENA_HALF +
      2 * ARENA_WALL_HALF_THICK +
      PROJ_RADIUS +
      2.5;
    if (
      (ent.state === 'enemy' ||
        ent.plasmaDir ||
        ent.friendlyFlightDir ||
        ent.bubbleMode) &&
      grabbedBody !== ent.body &&
      (Math.abs(p.x) > escapeR ||
        Math.abs(p.z) > escapeR ||
        p.y < ARENA_Y_MIN ||
        p.y > ARENA_Y_MAX)
    ) {
      removeProjectile(ent);
      continue;
    }
    if (grabbedBody !== ent.body && !ent.bubbleMode) {
      let spd;
      if (ent.plasmaDir) spd = PROJ_PLASMA_SPEED;
      else if (ent.state === 'enemy' && ent.enemyDir)
        spd = PROJ_ENEMY_SPEED * (ent.enemySpeedScale ?? 1);
      else if (ent.friendlyFlightDir)
        spd =
          ent.friendlyFlightSpeed ??
          LAUNCH_SPEED * LAUNCH_PROJECTILE_MULT;
      else spd = ent.body.velocity.length();
      ent.pathTraveled += spd * dt;
      let maxPath = PROJ_MAX_PATH_TRAVEL;
      if (ent.plasmaDir) maxPath = PROJ_PLASMA_MAX_PATH;
      else if (ent.friendlyFlightDir) maxPath = PROJ_FRIENDLY_STRAIGHT_MAX_PATH;
      if (ent.pathTraveled > maxPath) {
        removeProjectile(ent);
        continue;
      }
    }
    const lifeCap = ent.bubbleMode ? PROJ_BUBBLE_MAX_LIFE : PROJ_MAX_LIFE;
    if (ent.age > lifeCap && grabbedBody !== ent.body) {
      removeProjectile(ent);
    }
  }
}

/** Antes de integrar: en rectos solo se cancela parte de la gravedad; burbujas caen con el mundo. */
function cancelEnemyProjectileGravity() {
  const g = world.gravity;
  const gx = g.x;
  const gy = g.y;
  const gz = g.z;
  const k = PROJ_GRAVITY_CANCEL_STRAIGHT;
  for (const ent of enemyProjectiles) {
    if (ent.dead) continue;
    if (isBodyMagneticallyCaptured(ent.body)) continue;
    if (isBodyInMagneticFusion(ent.body)) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;
    if (grabbedBody === ent.body) continue;
    if (ent.bubbleMode) continue;
    const enemyRay = ent.state === 'enemy' && ent.enemyDir;
    const plasmaRay = Boolean(ent.plasmaDir);
    const friendlyRay =
      ent.state === 'friendly' && ent.friendlyFlightDir && !ent.plasmaDir;
    if (!enemyRay && !plasmaRay && !friendlyRay) continue;
    const b = ent.body;
    const m = b.mass;
    b.force.x -= m * gx * k;
    b.force.y -= m * gy * k;
    b.force.z -= m * gz * k;
  }
}

/** Después del paso: rectos mantienen velocidad en la mira pero mezclan un poco de caída; burbujas = física libre. */
function enforceEnemyProjectileStraightFlight() {
  const blend = PROJ_GRAVITY_BLEND_Y;
  for (const ent of enemyProjectiles) {
    if (ent.dead) continue;
    if (isBodyMagneticallyCaptured(ent.body)) continue;
    if (isBodyInMagneticFusion(ent.body)) continue;
    if (ent.shieldStuck || ent.shieldDropping) continue;
    if (grabbedBody === ent.body) continue;
    if (ent.bubbleMode) continue;
    if (ent.state === 'enemy' && ent.enemyDir) {
      const d = ent.enemyDir;
      const b = ent.body;
      const sp = PROJ_ENEMY_SPEED * (ent.enemySpeedScale ?? 1);
      const vyPhys = b.velocity.y;
      b.velocity.set(d.x * sp, d.y * sp, d.z * sp);
      b.velocity.y = THREE.MathUtils.lerp(d.y * sp, vyPhys, blend);
      b.angularVelocity.set(0, 0, 0);
      continue;
    }
    if (ent.plasmaDir) {
      const d = ent.plasmaDir;
      const b = ent.body;
      const sp = PROJ_PLASMA_SPEED;
      const vyPhys = b.velocity.y;
      b.velocity.set(d.x * sp, d.y * sp, d.z * sp);
      b.velocity.y = THREE.MathUtils.lerp(d.y * sp, vyPhys, blend);
      b.angularVelocity.set(0, 0, 0);
      continue;
    }
    if (ent.state === 'friendly' && ent.friendlyFlightDir && !ent.plasmaDir) {
      const d = ent.friendlyFlightDir;
      const sp =
        ent.friendlyFlightSpeed ??
        LAUNCH_SPEED * LAUNCH_PROJECTILE_MULT;
      const b = ent.body;
      const vyPhys = b.velocity.y;
      b.velocity.set(d.x * sp, d.y * sp, d.z * sp);
      b.velocity.y = THREE.MathUtils.lerp(d.y * sp, vyPhys, blend);
      b.angularVelocity.set(0, 0, 0);
    }
  }
}

function cancelMagneticCaptureGravity() {
  const g = world.gravity;
  const gx = g.x;
  const gy = g.y;
  const gz = g.z;
  const sub = (b) => {
    const m = b.mass;
    b.force.x -= m * gx;
    b.force.y -= m * gy;
    b.force.z -= m * gz;
  };
  for (const c of capturedObjects) {
    sub(c.body);
  }
  if (fusionState) {
    sub(fusionState.entryA.body);
    sub(fusionState.entryB.body);
  }
}

world.addEventListener('preStep', cancelEnemyProjectileGravity);
world.addEventListener('preStep', cancelMagneticCaptureGravity);
world.addEventListener('postStep', resolveProjectileArenaTunneling);
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
    if (isBodyInMagneticFusion(ent.body)) continue;
    if (isBodyMagneticallyCaptured(ent.body)) continue;

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
    removeMagneticCaptureForBody(ent.body);
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
    applyProjectileShieldStuckVisual(ent);
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
    if (
      ent.dead ||
      (ent.state !== 'enemy' && !ent.plasmaDir && !ent.friendlyFlightDir)
    ) {
      continue;
    }
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
      if (
        pe &&
        !pe.dead &&
        (pe.state === 'enemy' || pe.plasmaDir || pe.friendlyFlightDir)
      ) {
        near = true;
        break;
      }
    }
  }
  physicsTimeScale = near ? BULLET_TIME_SCALE : 1;
}

let spawnTimer = 0;
let testMgTimerA = 0;
let testMgTimerB = 0;

let grabbedBody = null;
let grabGlowMesh = null;
/** Clic izquierdo mantenido: escudo magnético + gesto de mano. */
let shieldPressed = false;

/** Celeste unificado: mira sobre algo agarrable (antes de clic). */
const GRAB_GLOW_COLOR = 0x5adfff;
const GRAB_GLOW_INTENSITY = 0.62;
/** Celeste unificado: vórtice / objeto transparente listo para lanzar. */
const GRAB_HELD_COLOR = 0x8ee7ff;
const GRAB_HELD_EMISSIVE = 0x3ec8f0;
const GRAB_HELD_EMISSIVE_INTENSITY = 1.05;
const GRAB_CUBE_OPACITY = 0.32;
/** Telaraña / plasma agarrado: ver la mira a través del proyectil. */
const GRAB_PROJECTILE_VORTEX_OPACITY = 0.36;
const GRAB_PLASMA_HELD_OPACITY = 0.48;

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

function applyGrabTransparency(mesh, opacity = GRAB_CUBE_OPACITY) {
  const mat = mesh.material;
  if (!mesh.userData.grabMatSave) {
    mesh.userData.grabMatSave = {
      opacity: mat.opacity,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite,
      color: mat.color.clone(),
      emissive: mat.emissive.clone(),
      emissiveIntensity: mat.emissiveIntensity,
    };
  }
  mat.color.setHex(GRAB_HELD_COLOR);
  mat.emissive.setHex(GRAB_HELD_EMISSIVE);
  mat.emissiveIntensity = GRAB_HELD_EMISSIVE_INTENSITY;
  mat.transparent = true;
  mat.opacity = opacity;
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
  mat.color.copy(s.color);
  mat.emissive.copy(s.emissive);
  mat.emissiveIntensity = s.emissiveIntensity;
  mat.needsUpdate = true;
  delete mesh.userData.grabMatSave;
}

function clearVortexTransparencyIfNotGrabbed(entry) {
  if (!entry || grabbedBody === entry.body) return;
  restoreVortexProjectilePlayerCollision(entry);
  if (entry.kind === 'cube' && entry.mesh) {
    clearGrabTransparency(entry.mesh);
  } else if (entry.projectileEnt?.visualMesh) {
    clearGrabTransparency(entry.projectileEnt.visualMesh);
  }
}

window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    if (!isPaused && controls.isLocked) shieldPressed = true;
    return;
  }
  if (isPaused || e.button !== 2 || !controls.isLocked) return;
  if (shieldPressed && capturedObjects.length > 0) {
    physicsTimeScale = 1;
    camera.getWorldDirection(_vortexLaunchDir);
    launchVortexContentsAlongAim(_vortexLaunchDir);
    handExtendedUntil = performance.now() + HAND_EXTENDED_MS;
    handShakeX += (Math.random() - 0.5) * 8;
    handShakeY += HAND_KICK_Y * 0.5;
    return;
  }
  const body = getLookedAtGrabbableBody();
  if (body) {
    const peGrab = body.userData?.projectileEnt;
    if (peGrab) {
      if (peGrab.shieldStuck) {
        restoreProjectileShieldStuckVisual(peGrab);
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
      delete peGrab.friendlyFlightDir;
      delete peGrab.friendlyFlightSpeed;
      delete peGrab.bubbleMode;
      delete peGrab.bubbleDir;
      delete peGrab.bubbleSpeed;
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
      pe.age = 0;
      delete pe.bubbleMode;
      delete pe.bubbleDir;
      delete pe.bubbleSpeed;
      pe.vortexImmuneUntil = performance.now() + VORTEX_LAUNCH_IMMUNE_MS;
      if (pe.plasmaDir) {
        pe.plasmaDir = { x: dir.x, y: dir.y, z: dir.z };
      }
    } else {
      const launchedMesh = meshFromBody(grabbedBody);
      if (launchedMesh?.userData) {
        launchedMesh.userData.vortexImmuneUntil =
          performance.now() + VORTEX_LAUNCH_IMMUNE_MS;
      }
    }
    const launchSpeed = pe
      ? LAUNCH_SPEED * LAUNCH_PROJECTILE_MULT
      : LAUNCH_SPEED;
    grabbedBody.velocity.set(
      dir.x * launchSpeed,
      dir.y * launchSpeed,
      dir.z * launchSpeed
    );
    if (pe && pe.state === 'friendly' && !pe.plasmaDir) {
      pe.friendlyFlightDir = { x: dir.x, y: dir.y, z: dir.z };
      pe.friendlyFlightSpeed = launchSpeed;
    }
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
  if (e.code === 'Tab' && controls.isLocked && !isPaused) {
    e.preventDefault();
    if (capturedObjects.length > 2) {
      const nPairs = getFusionPairCount(capturedObjects.length);
      if (nPairs > 0) {
        fusionPairCursor = (fusionPairCursor + 1) % nPairs;
      }
    }
    return;
  }
  if (e.code === 'KeyE' && !e.repeat && controls.isLocked && !isPaused) {
    e.preventDefault();
    tryStartMagneticFusion();
    return;
  }
  if (e.code === 'KeyP' && !e.repeat) {
    if (isGameOver) return;
    isPaused = !isPaused;
    if (pauseOverlayEl) {
      pauseOverlayEl.classList.toggle('visible', isPaused);
      pauseOverlayEl.setAttribute('aria-hidden', isPaused ? 'false' : 'true');
    }
    if (isPaused) {
      shieldPressed = false;
      abortMagneticFusionKeepBodies();
      releaseAllMagneticCapture();
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

  if (controls.isLocked && !isPaused && !isGameOver) {
    gameTimeSec += dt;
    updateGameHud();
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

  if (!isPaused && !isGameOver) {
    playerTarget.position.copy(controls.object.position);
  }

  if (!isPaused) {
    const shakeDecay = Math.pow(0.82, dt * 60);
    handShakeX *= shakeDecay;
    handShakeY *= shakeDecay;
  }

  rightHandSprite.position.set(
    handRightBaseX + handShakeX,
    handBaseY + handShakeY,
    0
  );
  leftHandSprite.position.set(handLeftBaseX, handBaseY, 0);

  if (controls.isLocked && !isPaused && !isGameOver) {
    if (!TEST_MODE_NO_DRONES) {
      spawnTimer += dt;
      if (spawnTimer >= SPAWN_INTERVAL) {
        spawnTimer = 0;
        const alive = drones.filter((d) => !d.dying).length;
        if (alive < MAX_DRONES) {
          const p = randomSpawnPointAroundPlayer();
          createDrone(p.x, p.y, p.z);
        }
      }
    }
    if (TEST_MODE_DUAL_MG) {
      const tx = camera.position.x;
      const ty = camera.position.y;
      const tz = camera.position.z;
      testMgTimerA += dt;
      testMgTimerB += dt;
      if (testMgTimerA >= TEST_MG_FIRE_INTERVAL) {
        testMgTimerA = 0;
        createEnemyProjectile(
          TEST_MG_A.x,
          TEST_MG_A.y,
          TEST_MG_A.z,
          tx,
          ty,
          tz
        );
      }
      if (testMgTimerB >= TEST_MG_FIRE_INTERVAL) {
        testMgTimerB = 0;
        createEnemyProjectile(
          TEST_MG_B.x,
          TEST_MG_B.y,
          TEST_MG_B.z,
          tx,
          ty,
          tz
        );
      }
    }
  } else if (!controls.isLocked || isGameOver) {
    spawnTimer = 0;
    testMgTimerA = 0;
    testMgTimerB = 0;
  }

  if (!isPaused && !isGameOver) {
    updateBulletTimeAndPhysicsScale();
    if (controls.isLocked) {
      updateDronesAI(dt);
    }
    updateProjectileLife(dt);
    syncPlayerHitBody();

    updateMagneticFusion(dt);
    /** Escudo/vórtice sueltos antes del paso de física: si no, un frame con captura/gravedad anulada deja cubos y balas flotando. */
    if (!shieldPressed) {
      releaseAllMagneticCapture();
      releaseShieldStuckProjectiles();
    }
    world.fixedStep((1 / 60) * physicsTimeScale, 20);
    syncMeshesFromPhysics();
    syncDroneMeshes();
    syncProjectileMeshes();
    updateMagneticFusion(dt);
    syncMeshesFromPhysics();
    syncProjectileMeshes();
    updateMagneticVortex(dt);
    applyMagneticWebVisualJitter(performance.now());
    updateMagneticFusionLine();
    updateShieldStuckProjectiles();
    updateDronesDeath(dt);
  }

  updateFusionExplosionTriggers(dt);
  updateFusionParticleBursts(dt);
  updateFusionExplosionLights(dt);

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

    let desiredRight = 'open';
    if (!isPaused) {
      if (grabbedBody !== null) {
        desiredRight = 'close';
      } else if (performance.now() < handExtendedUntil) {
        desiredRight = 'extended';
      } else {
        desiredRight = 'open';
      }
    }
    if (desiredRight !== lastRightHandVisual) {
      applyHandTextureToMaterial(rightHandMat, desiredRight, false);
      lastRightHandVisual = desiredRight;
    }

    let desiredLeft = 'open';
    if (!isPaused && shieldPressed) {
      desiredLeft = 'extended';
    }
    if (desiredLeft !== lastLeftHandVisual) {
      applyHandTextureToMaterial(leftHandMat, desiredLeft, true);
      lastLeftHandVisual = desiredLeft;
    }

    sceneHUD.visible = true;
  } else {
    magnetShieldGroup.visible = false;
    sceneHUD.visible = false;
    crosshairMat.color.set(0xffffff);
    clearGrabGlow();
  }

  const _shakeD = Math.pow(0.84, dt * 60);
  fusionCameraShake.x *= _shakeD;
  fusionCameraShake.y *= _shakeD;
  fusionCameraShake.z *= _shakeD;
  camera.position.x += fusionCameraShake.x;
  camera.position.y += fusionCameraShake.y;
  camera.position.z += fusionCameraShake.z;
  composer.render();
  camera.position.x -= fusionCameraShake.x;
  camera.position.y -= fusionCameraShake.y;
  camera.position.z -= fusionCameraShake.z;

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

if (gameOverOverlayEl) {
  gameOverOverlayEl.addEventListener('click', () => location.reload());
}

updateGameHud();

animate();
