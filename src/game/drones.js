import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  ARENA_HALF,
  COLLISION_GROUP_DRONE,
  COLLISION_MASK_DRONE,
  CUBE_KILL_DRONE_SPEED,
  DRONE_ATTACK_MAX_DIST,
  DRONE_ATTACK_MIN_DIST,
  DRONE_ATTACKING_EMISSIVE_BOOST,
  DRONE_BURST_COUNT,
  DRONE_BURST_SHOT_DELAY,
  DRONE_CHASER_SPEED_MULT,
  DRONE_CLOSE_CHASE_RADIUS,
  DRONE_COORD_HOLD_SPEED_MULT,
  DRONE_DEATH_SHRINK_SPEED,
  DRONE_FIRE_COOLDOWN,
  DRONE_FLASH_SEC,
  DRONE_LINEAR_DAMPING,
  DRONE_MAX_CLOSE_CHASERS,
  DRONE_MAX_SPEED,
  DRONE_MASS,
  DRONE_ORBIT_RADIUS_MAX,
  DRONE_ORBIT_RADIUS_MIN,
  DRONE_ORBITER_LINEAR_DAMPING,
  DRONE_ORBITER_RADIUS_MULT,
  DRONE_PERSONAL_OFFSET_RANGE,
  DRONE_RADIUS,
  DRONE_SEPARATION_RADIUS,
  DRONE_SEPARATION_WEIGHT,
  DRONE_SHOOTER_FLEE_BOOST,
  DRONE_SHOOTER_FIRE_MAX_DIST,
  DRONE_SHOOTER_FIRE_MIN_DIST,
  DRONE_SHOOTER_IDEAL_DIST,
  DRONE_SHOOTER_AIM_TIME,
  DRONE_SHOOTER_PHASE_COOLDOWN,
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
  let nextDroneId = 1;

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
    const baseEmissiveIntensity = elite ? 1.7 : 1.35;
    if (elite) {
      mat.color.setHex(0x5a4868);
      mat.emissive.setHex(0x7722ff);
      mat.emissiveIntensity = baseEmissiveIntensity;
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

    const aiState =
      behaviorType === DRONE_TYPE_SHOOTER
        ? 'repositioning'
        : behaviorType === DRONE_TYPE_ORBITER
          ? 'orbiting'
          : 'chasing';
    const drone = {
      id: nextDroneId++,
      mesh,
      body,
      elite,
      behaviorType,
      aiState,
      stateTimer: 0,
      baseEmissiveIntensity,
      dying: false,
      deathPhase: 0,
      personalOffset: randomPersonalOffset(),
      shootTimer: 0,
      aimInAttackBand: false,
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

    const orbiters = [];
    for (const d of drones) {
      if (!d.dying && d.behaviorType === DRONE_TYPE_ORBITER) orbiters.push(d);
    }
    orbiters.sort((a, b) => a.id - b.id);
    const nOrb = orbiters.length;
    for (let i = 0; i < nOrb; i++) orbiters[i]._orbitSlot = i;

    const chaserNear = [];
    for (const d of drones) {
      if (d.dying) continue;
      if (d.behaviorType !== DRONE_TYPE_CHASER) continue;
      const b = d.body;
      const hdx = b.position.x - px;
      const hdz = b.position.z - pz;
      const hDist = Math.sqrt(hdx * hdx + hdz * hdz);
      if (hDist < DRONE_CLOSE_CHASE_RADIUS) chaserNear.push({ d, hDist });
    }
    chaserNear.sort((a, b) => a.hDist - b.hDist);
    const allowedClose = new Set(
      chaserNear.slice(0, DRONE_MAX_CLOSE_CHASERS).map((x) => x.d)
    );

    const fire = (b) =>
      createEnemyProjectile(b.position.x, b.position.y, b.position.z, px, py, pz);

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

      const inShooterFireRange =
        distToPlayer >= DRONE_SHOOTER_FIRE_MIN_DIST &&
        distToPlayer <= DRONE_SHOOTER_FIRE_MAX_DIST;

      if (d.behaviorType !== DRONE_TYPE_SHOOTER) {
        d.aimInAttackBand = inAttackBand;
        if (inAttackBand) {
          d.shootTimer += dt;
          if (d.shootTimer >= DRONE_FIRE_COOLDOWN) {
            d.shootTimer = 0;
            fire(b);
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

      if (d.behaviorType === DRONE_TYPE_SHOOTER) {
        d.aimInAttackBand = inShooterFireRange;

        if (!inShooterFireRange) {
          d.burstRemaining = 0;
          d.burstGapT = 0;
          d.reloadT = 0;
          d.aiState = 'repositioning';
          d.stateTimer = 0;
        } else if (d.aiState === 'repositioning') {
          const okBand =
            hDist >= DRONE_SHOOTER_FIRE_MIN_DIST * 0.82 &&
            hDist <= DRONE_SHOOTER_FIRE_MAX_DIST + 1.2;
          if (okBand) {
            d.aiState = 'aiming';
            d.stateTimer = DRONE_SHOOTER_AIM_TIME;
          }
        } else if (d.aiState === 'aiming') {
          d.stateTimer -= dt;
          if (d.stateTimer <= 0) {
            d.aiState = 'attacking';
            d.burstRemaining = DRONE_BURST_COUNT;
            d.burstGapT = 0;
          }
        } else if (d.aiState === 'attacking') {
          if (d.burstRemaining > 0) {
            d.burstGapT -= dt;
            if (d.burstGapT <= 0) {
              fire(b);
              d.burstRemaining -= 1;
              if (d.burstRemaining > 0) {
                d.burstGapT = DRONE_BURST_SHOT_DELAY;
              } else {
                d.aiState = 'cooldown';
                d.stateTimer = DRONE_SHOOTER_PHASE_COOLDOWN;
              }
            }
          }
        } else if (d.aiState === 'cooldown') {
          d.stateTimer -= dt;
          if (d.stateTimer <= 0) d.aiState = 'repositioning';
        }
      }

      let tx = px + ox;
      let tz = pz + oz;
      let moveSpeed = DRONE_MAX_SPEED * (d.elite ? 1.2 : 1);
      const bt = d.behaviorType;
      const baseDamp = d.elite
        ? DRONE_LINEAR_DAMPING * 0.88
        : DRONE_LINEAR_DAMPING;

      if (bt === DRONE_TYPE_ORBITER) {
        d.aiState = 'orbiting';
        b.linearDamping = DRONE_ORBITER_LINEAR_DAMPING;
        const idx = d._orbitSlot ?? 0;
        const slotAngle = nOrb > 0 ? (idx / nOrb) * Math.PI * 2 : 0;
        const R = d.orbitRadius * DRONE_ORBITER_RADIUS_MULT;
        tx = px + Math.cos(slotAngle) * R + ox * 0.35;
        tz = pz + Math.sin(slotAngle) * R + oz * 0.35;
      } else {
        b.linearDamping = baseDamp;
        if (bt === DRONE_TYPE_SHOOTER) {
          const sp = DRONE_SHOOTER_SPEED * (d.elite ? 1.1 : 1);
          if (d.aiState === 'aiming' || d.aiState === 'attacking') {
            moveSpeed = 0;
          } else if (d.aiState === 'cooldown') {
            moveSpeed = sp * 0.58;
          } else {
            moveSpeed = sp;
          }
          let ideal = DRONE_SHOOTER_IDEAL_DIST;
          if (hDist > 0.08) {
            const inv = 1 / hDist;
            if (hDist < ideal) {
              ideal += (ideal - hDist) * DRONE_SHOOTER_FLEE_BOOST;
            }
            ideal = Math.min(ideal, DRONE_ATTACK_MAX_DIST - 1);
            tx = px + hdx * inv * ideal + ox * 0.45;
            tz = pz + hdz * inv * ideal + oz * 0.45;
          }
        } else {
          let coordHold = false;
          if (
            bt === DRONE_TYPE_CHASER &&
            hDist < DRONE_CLOSE_CHASE_RADIUS &&
            !allowedClose.has(d)
          ) {
            coordHold = true;
            d.aiState = 'holding';
          } else if (bt === DRONE_TYPE_CHASER) {
            d.aiState = 'chasing';
          }
          moveSpeed *= DRONE_CHASER_SPEED_MULT;
          if (coordHold) {
            moveSpeed *= DRONE_COORD_HOLD_SPEED_MULT;
            const holdR = DRONE_CLOSE_CHASE_RADIUS + 6.2;
            const spread = (d.id * 2.399963229728653) % (Math.PI * 2);
            tx = px + Math.cos(spread) * holdR;
            tz = pz + Math.sin(spread) * holdR;
          } else if (hDist > 0.08 && distToPlayer < DRONE_ATTACK_MIN_DIST) {
            const inv = 1 / hDist;
            const ringR = DRONE_ATTACK_MIN_DIST + 2;
            tx = px + hdx * inv * ringR;
            tz = pz + hdz * inv * ringR;
          }
        }
      }

      let tdx = tx - b.position.x;
      let tdz = tz - b.position.z;
      let distH = Math.sqrt(tdx * tdx + tdz * tdz);

      let nx = 0;
      let nz = 0;
      if (distH > 0.001) {
        const invH = 1 / distH;
        nx = tdx * invH;
        nz = tdz * invH;
      }

      let sx = 0;
      let sz = 0;
      const sepR = DRONE_SEPARATION_RADIUS;
      const sepR2 = sepR * sepR;
      for (const other of drones) {
        if (other === d || other.dying) continue;
        const ob = other.body;
        const ox2 = b.position.x - ob.position.x;
        const oz2 = b.position.z - ob.position.z;
        const dh2 = ox2 * ox2 + oz2 * oz2;
        if (dh2 < 0.0001 || dh2 >= sepR2) continue;
        const dh = Math.sqrt(dh2);
        const push = (sepR - dh) / sepR;
        sx += (ox2 / dh) * push;
        sz += (oz2 / dh) * push;
      }
      const slen = Math.sqrt(sx * sx + sz * sz);
      if (slen > 0.001) {
        const invS = 1 / slen;
        nx += sx * invS * DRONE_SEPARATION_WEIGHT;
        nz += sz * invS * DRONE_SEPARATION_WEIGHT;
      }
      const flen = Math.sqrt(nx * nx + nz * nz);
      let effSpeed = moveSpeed;
      if (moveSpeed < 0.05 && flen > 0.02) {
        effSpeed = Math.max(moveSpeed, 2.1);
      }
      if (flen > 0.02) {
        const invF = 1 / flen;
        b.velocity.x = nx * invF * effSpeed;
        b.velocity.z = nz * invF * effSpeed;
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
      if (!d.elite && d.behaviorType === DRONE_TYPE_SHOOTER) {
        const atk =
          d.aiState === 'aiming' || d.aiState === 'attacking';
        d.mesh.material.emissiveIntensity =
          d.baseEmissiveIntensity + (atk ? DRONE_ATTACKING_EMISSIVE_BOOST : 0);
      }
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
