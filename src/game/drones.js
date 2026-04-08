import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  ARENA_HALF,
  COLLISION_GROUP_DRONE,
  COLLISION_MASK_DRONE,
  CUBE_KILL_DRONE_SPEED,
  DRONE_ATTACK_MAX_DIST,
  DRONE_ATTACK_MIN_DIST,
  DRONE_DEATH_SHRINK_SPEED,
  DRONE_FIRE_COOLDOWN,
  DRONE_FLASH_SEC,
  DRONE_LINEAR_DAMPING,
  DRONE_MAX_SPEED,
  DRONE_MASS,
  DRONE_PERSONAL_OFFSET_RANGE,
  DRONE_RADIUS,
  ELITE_DRONE_MASS,
  ELITE_DRONE_RADIUS,
  ELITE_SPAWN_EVERY_NORMAL_KILLS,
  MAX_DRONES,
  SPAWN_RING_INNER,
  SPAWN_RING_OUTER,
} from '../config/constants.js';

/** Inyecta escena/mundo/cámara y callbacks. */
export function createDronesSystem(deps) {
  const {
    scene,
    world,
    playerTarget,
    getCubeMeshes,
    createEnemyProjectile,
    onDroneKill,
  } = deps;

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
    const pt = playerTarget.position;
    let x = pt.x + Math.cos(angle) * dist;
    let z = pt.z + Math.sin(angle) * dist;
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
      collisionFilterGroup: COLLISION_GROUP_DRONE,
      collisionFilterMask: COLLISION_MASK_DRONE,
    });
    body.addShape(shape);
    body.userData = { isDrone: true };
    // Ignorar gravedad en Y: el suelo y la altura se fijan en syncDroneMeshes.
    body.linearFactor.set(1, 0, 1);
    world.addBody(body);

    const drone = {
      mesh,
      body,
      elite,
      dying: false,
      deathPhase: 0,
      personalOffset: randomPersonalOffset(),
      shootTimer: 0,
      aimInAttackBand: false,
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

  function updateDronesAI(dt) {
    const pt = playerTarget.position;
    const px = pt.x;
    const py = pt.y;
    const pz = pt.z;

    for (const d of drones) {
      if (d.dying) continue;
      const b = d.body;
      b.wakeUp();

      const dxP = px - b.position.x;
      const dyP = py - b.position.y;
      const dzP = pz - b.position.z;
      const distToPlayer = Math.sqrt(dxP * dxP + dyP * dyP + dzP * dzP);
      const inAttackBand =
        distToPlayer >= DRONE_ATTACK_MIN_DIST &&
        distToPlayer <= DRONE_ATTACK_MAX_DIST;
      d.aimInAttackBand = inAttackBand;

      if (inAttackBand) {
        d.shootTimer += dt;
        if (d.shootTimer >= DRONE_FIRE_COOLDOWN) {
          d.shootTimer = 0;
          createEnemyProjectile(b.position.x, b.position.y, b.position.z, px, py, pz);
        }
      } else {
        d.shootTimer = 0;
      }

      // Objetivo solo en XZ (suelo); el offset Y del spawn no se usa para perseguir en altura
      let tx = px + d.personalOffset.x;
      let tz = pz + d.personalOffset.z;
      const hdx = b.position.x - px;
      const hdz = b.position.z - pz;
      const hDist = Math.sqrt(hdx * hdx + hdz * hdz);
      if (hDist > 0.08 && distToPlayer < DRONE_ATTACK_MIN_DIST) {
        const inv = 1 / hDist;
        const ringR = DRONE_ATTACK_MIN_DIST + 2;
        tx = px + hdx * inv * ringR;
        tz = pz + hdz * inv * ringR;
      }

      const tdx = tx - b.position.x;
      const tdz = tz - b.position.z;
      const distH = Math.sqrt(tdx * tdx + tdz * tdz);
      const speed = DRONE_MAX_SPEED * (d.elite ? 1.2 : 1);

      if (distH > 0.02) {
        const inv = 1 / distH;
        b.velocity.x = tdx * inv * speed;
        b.velocity.z = tdz * inv * speed;
      } else {
        b.velocity.x = 0;
        b.velocity.z = 0;
      }
      b.velocity.y = 0;
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
      const b = d.body;
      const r = d.elite ? ELITE_DRONE_RADIUS : DRONE_RADIUS;
      // Plano del suelo en Y=0: centro de la esfera apoyada
      b.position.y = r;
      b.velocity.y = 0;
      d.mesh.position.copy(b.position);
      if (d.aimInAttackBand) {
        d.mesh.lookAt(playerTarget.position);
      }
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
