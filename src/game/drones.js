import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  ARENA_HALF,
  COLLISION_GROUP_DRONE,
  COLLISION_MASK_DRONE,
  CUBE_KILL_DRONE_SPEED,
  DRONE_ATTACK_MAX_DIST,
  DRONE_ATTACK_MIN_DIST,
  DRONE_BURST_COUNT,
  DRONE_BURST_RELOAD,
  DRONE_BURST_SHOT_DELAY,
  DRONE_DEATH_SHRINK_SPEED,
  DRONE_FIRE_COOLDOWN,
  DRONE_FLASH_SEC,
  DRONE_LINEAR_DAMPING,
  DRONE_MAX_SPEED,
  DRONE_MASS,
  DRONE_ORBIT_ANGULAR_SPEED,
  DRONE_ORBIT_RADIUS_MAX,
  DRONE_ORBIT_RADIUS_MIN,
  DRONE_PERSONAL_OFFSET_RANGE,
  DRONE_RADIUS,
  DRONE_SHOOTER_IDEAL_DIST,
  DRONE_SHOOTER_SPEED,
  DRONE_TYPE_CHASER,
  DRONE_TYPE_ORBITER,
  DRONE_TYPE_SHOOTER,
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

  function pickBehaviorType() {
    const r = Math.random();
    if (r < 0.45) return DRONE_TYPE_CHASER;
    if (r < 0.8) return DRONE_TYPE_ORBITER;
    return DRONE_TYPE_SHOOTER;
  }

  /** Colores estilo Pac-Man: chaser rojo, orbiter cyan, shooter naranja. */
  function applyArcadeDroneMaterial(mat, behaviorType) {
    if (behaviorType === DRONE_TYPE_CHASER) {
      mat.color.setHex(0xff2222);
      mat.emissive.setHex(0x551010);
    } else if (behaviorType === DRONE_TYPE_ORBITER) {
      mat.color.setHex(0x44eeff);
      mat.emissive.setHex(0x104858);
    } else {
      mat.color.setHex(0xff8800);
      mat.emissive.setHex(0x553010);
    }
    mat.emissiveIntensity = 1.35;
  }

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
    const behaviorType = elite
      ? DRONE_TYPE_CHASER
      : opts.behaviorType ?? pickBehaviorType();
    const geo = elite ? eliteDroneGeo : droneGeo;
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a4a55,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0xff0505,
      emissiveIntensity: 1.35,
    });
    if (elite) {
      mat.color.setHex(0x5a4868);
      mat.emissive.setHex(0x7722ff);
      mat.emissiveIntensity = 1.7;
    } else {
      applyArcadeDroneMaterial(mat, behaviorType);
    }
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
      behaviorType,
      dying: false,
      deathPhase: 0,
      personalOffset: randomPersonalOffset(),
      shootTimer: 0,
      aimInAttackBand: false,
      orbitAngle: Math.random() * Math.PI * 2,
      orbitDir: Math.random() < 0.5 ? 1 : -1,
      orbitRadius:
        DRONE_ORBIT_RADIUS_MIN +
        Math.random() * (DRONE_ORBIT_RADIUS_MAX - DRONE_ORBIT_RADIUS_MIN),
      burstRemaining: 0,
      burstGapT: 0,
      reloadT: 0,
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

      const fire = () =>
        createEnemyProjectile(b.position.x, b.position.y, b.position.z, px, py, pz);

      if (d.behaviorType === DRONE_TYPE_SHOOTER) {
        if (inAttackBand) {
          if (d.reloadT > 0) {
            d.reloadT -= dt;
          } else if (d.burstRemaining > 0) {
            d.burstGapT -= dt;
            if (d.burstGapT <= 0) {
              fire();
              d.burstRemaining -= 1;
              if (d.burstRemaining > 0) {
                d.burstGapT = DRONE_BURST_SHOT_DELAY;
              } else {
                d.reloadT = DRONE_BURST_RELOAD;
              }
            }
          } else {
            d.burstRemaining = DRONE_BURST_COUNT;
            d.burstGapT = 0;
          }
        } else {
          d.shootTimer = 0;
          d.burstRemaining = 0;
          d.burstGapT = 0;
          d.reloadT = 0;
        }
      } else {
        if (inAttackBand) {
          d.shootTimer += dt;
          if (d.shootTimer >= DRONE_FIRE_COOLDOWN) {
            d.shootTimer = 0;
            fire();
          }
        } else {
          d.shootTimer = 0;
        }
      }

      const ox = d.personalOffset.x;
      const oz = d.personalOffset.z;
      const hdx = b.position.x - px;
      const hdz = b.position.z - pz;
      const hDist = Math.sqrt(hdx * hdx + hdz * hdz);

      let tx = px + ox;
      let tz = pz + oz;
      let moveSpeed = DRONE_MAX_SPEED * (d.elite ? 1.2 : 1);
      const bt = d.behaviorType;

      if (bt === DRONE_TYPE_ORBITER) {
        d.orbitAngle += dt * DRONE_ORBIT_ANGULAR_SPEED * d.orbitDir;
        const R = d.orbitRadius;
        tx = px + Math.cos(d.orbitAngle) * R + ox * 0.35;
        tz = pz + Math.sin(d.orbitAngle) * R + oz * 0.35;
      } else if (bt === DRONE_TYPE_SHOOTER) {
        moveSpeed = DRONE_SHOOTER_SPEED * (d.elite ? 1.1 : 1);
        const ideal = DRONE_SHOOTER_IDEAL_DIST;
        if (hDist > 0.08) {
          const inv = 1 / hDist;
          tx = px + hdx * inv * ideal + ox * 0.45;
          tz = pz + hdz * inv * ideal + oz * 0.45;
        }
      } else {
        if (hDist > 0.08 && distToPlayer < DRONE_ATTACK_MIN_DIST) {
          const inv = 1 / hDist;
          const ringR = DRONE_ATTACK_MIN_DIST + 2;
          tx = px + hdx * inv * ringR;
          tz = pz + hdz * inv * ringR;
        }
      }

      const tdx = tx - b.position.x;
      const tdz = tz - b.position.z;
      const distH = Math.sqrt(tdx * tdx + tdz * tdz);

      if (distH > 0.02) {
        const inv = 1 / distH;
        b.velocity.x = tdx * inv * moveSpeed;
        b.velocity.z = tdz * inv * moveSpeed;
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
