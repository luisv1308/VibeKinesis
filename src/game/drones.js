import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  ARENA_HALF,
  CUBE_KILL_DRONE_SPEED,
  DRONE_ATTACK_MAX_DIST,
  DRONE_ATTACK_MIN_DIST,
  DRONE_DEATH_SHRINK_SPEED,
  DRONE_FIRE_COOLDOWN,
  DRONE_FLASH_SEC,
  DRONE_LINEAR_DAMPING,
  DRONE_MAX_FORCE,
  DRONE_MAX_SPEED,
  DRONE_MASS,
  DRONE_ORBIT_ANGULAR_SPEED,
  DRONE_PATTERN_CHASER,
  DRONE_PATTERN_STRAFE,
  DRONE_PERSONAL_OFFSET_RANGE,
  DRONE_RADIUS,
  DRONE_STEER_STRENGTH,
  DRONE_STRAFE_RADIUS_MAX,
  DRONE_STRAFE_RADIUS_MIN,
  ELITE_DRONE_MASS,
  ELITE_DRONE_RADIUS,
  ELITE_SPAWN_EVERY_NORMAL_KILLS,
  MAX_DRONES,
  SPAWN_RING_INNER,
  SPAWN_RING_OUTER,
} from '../config/constants.js';

/** Inyecta escena/mundo/cámara y callbacks; `createEnemyProjectile` puede enlazarse tras definirse en main. */
export function createDronesSystem(deps) {
  const { scene, world, camera, playerTarget, getCubeMeshes, createEnemyProjectile, onDroneKill } =
    deps;

  const droneGeo = new THREE.SphereGeometry(DRONE_RADIUS, 20, 20);
  const eliteDroneGeo = new THREE.SphereGeometry(ELITE_DRONE_RADIUS, 22, 22);
  const eliteShieldGeo = new THREE.SphereGeometry(1, 18, 18);
  const eliteShieldMat = new THREE.MeshBasicMaterial({
    color: 0x9933ff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  /** @type {object[]} */
  const drones = [];

  function randomSpawnPointAroundPlayer() {
    const angle = Math.random() * Math.PI * 2;
    const dist =
      SPAWN_RING_INNER + Math.random() * (SPAWN_RING_OUTER - SPAWN_RING_INNER);
    let x = camera.position.x + Math.cos(angle) * dist;
    let z = camera.position.z + Math.sin(angle) * dist;
    const y = 0.9 + Math.random() * 5;
    const half = ARENA_HALF;
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

  function createDrone(x, y, z, opts = {}) {
    const elite = opts.elite === true;
    const geo = elite ? eliteDroneGeo : droneGeo;
    const mat = new THREE.MeshStandardMaterial({
      color: elite ? 0x5a4868 : 0x4a4a55,
      metalness: 0.9,
      roughness: 0.22,
      emissive: elite ? 0x7722ff : 0xff0505,
      emissiveIntensity: elite ? 1.7 : 1.35,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    if (elite) {
      const shield = new THREE.Mesh(eliteShieldGeo, eliteShieldMat);
      shield.scale.setScalar(1.26);
      mesh.add(shield);
    }
    scene.add(mesh);

    const radius = elite ? ELITE_DRONE_RADIUS : DRONE_RADIUS;
    const shape = new CANNON.Sphere(radius);
    const body = new CANNON.Body({
      mass: elite ? ELITE_DRONE_MASS : DRONE_MASS,
      linearDamping: elite ? DRONE_LINEAR_DAMPING * 0.88 : DRONE_LINEAR_DAMPING,
      angularDamping: 0.82,
      position: new CANNON.Vec3(x, y, z),
    });
    body.addShape(shape);
    world.addBody(body);

    const roll = Math.random();
    const aiPattern =
      opts.aiPattern ??
      (roll < 0.5 ? DRONE_PATTERN_CHASER : DRONE_PATTERN_STRAFE);
    const drone = {
      mesh,
      body,
      elite,
      dying: false,
      deathPhase: 0,
      personalOffset: randomPersonalOffset(),
      shootTimer: 0,
      aiPattern,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      orbitRadius:
        DRONE_STRAFE_RADIUS_MIN +
        Math.random() * (DRONE_STRAFE_RADIUS_MAX - DRONE_STRAFE_RADIUS_MIN),
    };

    body.addEventListener('collide', (e) => {
      if (drone.dying) return;
      const other = e.body;
      const cubeMeshHit = getCubeMeshes().find((m) => m.userData.body === other);
      if (!cubeMeshHit) return;
      const needSpeed = cubeMeshHit.userData.isMegaCube
        ? CUBE_KILL_DRONE_SPEED * 0.48
        : CUBE_KILL_DRONE_SPEED;
      if (other.velocity.length() < needSpeed) return;
      killDrone(drone);
    });

    drones.push(drone);
    return drone;
  }

  function createEliteDrone(x, y, z) {
    return createDrone(x, y, z, { elite: true });
  }

  function killDrone(drone, opts = {}) {
    const allowElite = opts.allowEliteKill === true;
    if (drone.dying) return;
    if (drone.elite && !allowElite) return;
    drone.dying = true;
    drone.deathPhase = 0;
    world.removeBody(drone.body);
    drone.mesh.material.emissive.setHex(0xff6666);
    drone.mesh.material.emissiveIntensity = 5;
    drone.mesh.material.color.setHex(0xffffff);

    onDroneKill(drone, {
      requestEliteSpawn: () => {
        const alive = drones.filter((d) => !d.dying).length;
        if (alive < MAX_DRONES) {
          const p = randomSpawnPointAroundPlayer();
          createEliteDrone(p.x, p.y, p.z);
        }
      },
    });
  }

  const _droneToPlayer = new CANNON.Vec3();
  const _droneForce = new CANNON.Vec3();
  const _droneRadialXZ = new THREE.Vector3();

  function updateDronesAI(dt) {
    const px = playerTarget.position.x;
    const py = playerTarget.position.y;
    const pz = playerTarget.position.z;

    for (const d of drones) {
      if (d.dying) continue;
      const b = d.body;
      const pattern = d.aiPattern || DRONE_PATTERN_CHASER;

      _droneToPlayer.set(px - b.position.x, py - b.position.y, pz - b.position.z);
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
        if (pattern === DRONE_PATTERN_CHASER) {
          continue;
        }
      } else {
        d.shootTimer = 0;
      }

      const ox = d.personalOffset.x;
      const oy = d.personalOffset.y;
      const oz = d.personalOffset.z;

      let tx;
      let ty;
      let tz;
      if (pattern === DRONE_PATTERN_STRAFE) {
        d.orbitAngle =
          (d.orbitAngle ?? 0) +
          dt * DRONE_ORBIT_ANGULAR_SPEED * (d.orbitDir ?? 1);
        const r = d.orbitRadius ?? 15;
        const oxs = ox * 0.35;
        const ozs = oz * 0.35;
        tx = px + Math.cos(d.orbitAngle) * r + oxs;
        ty = py + oy * 0.45;
        tz = pz + Math.sin(d.orbitAngle) * r + ozs;
      } else {
        tx = camera.position.x + ox;
        ty = camera.position.y + oy;
        tz = camera.position.z + oz;
        _droneRadialXZ.set(b.position.x - px, 0, b.position.z - pz);
        const rh = _droneRadialXZ.length();
        if (rh > 0.08 && distToCam < DRONE_ATTACK_MIN_DIST) {
          _droneRadialXZ.multiplyScalar(1 / rh);
          const ringR = DRONE_ATTACK_MIN_DIST + 2;
          tx = px + _droneRadialXZ.x * ringR;
          tz = pz + _droneRadialXZ.z * ringR;
        }
      }

      _droneToPlayer.set(tx - b.position.x, ty - b.position.y, tz - b.position.z);
      const dist = _droneToPlayer.length();
      if (dist < 0.15) continue;
      _droneToPlayer.scale(1 / dist, _droneToPlayer);
      const vx = b.velocity.x;
      const vy = b.velocity.y;
      const vz = b.velocity.z;
      const k = b.mass * DRONE_STEER_STRENGTH * dt * (d.elite ? 1.2 : 1);
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
        const shrink = Math.max(
          0,
          1 - (d.deathPhase - DRONE_FLASH_SEC) * DRONE_DEATH_SHRINK_SPEED
        );
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

  function killDronesInSphere(cx, cy, cz, radius, comboExplosion = false) {
    const r2 = radius * radius;
    for (const d of drones) {
      if (d.dying) continue;
      if (d.elite && !comboExplosion) continue;
      const q = d.body.position;
      const dx = q.x - cx;
      const dy = q.y - cy;
      const dz = q.z - cz;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        killDrone(d, { allowEliteKill: comboExplosion });
      }
    }
  }

  return {
    drones,
    randomSpawnPointAroundPlayer,
    createDrone,
    createEliteDrone,
    killDrone,
    updateDronesAI,
    updateDronesDeath,
    syncDroneMeshes,
    killDronesInSphere,
  };
}
