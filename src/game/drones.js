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
  DRONE_BLOCK_DIST,
  DRONE_BURST_COUNT,
  DRONE_BURST_SHOT_DELAY,
  DRONE_CHASER_SPEED_MULT,
  DRONE_CLOSE_CHASE_RADIUS,
  DRONE_COORD_HOLD_SPEED_MULT,
  DRONE_DEATH_SHRINK_SPEED,
  DRONE_ELITE_BURST_RAYS,
  DRONE_ELITE_BURST_SPEED_MULT,
  DRONE_ELITE_CHARGE_DURATION,
  DRONE_ELITE_CHARGE_SPEED,
  DRONE_ELITE_CHARGE_TELEGRAPH,
  DRONE_ELITE_HP,
  DRONE_ELITE_SNIPER_COOLDOWN,
  DRONE_ELITE_SNIPER_SHOT_SPEED_MULT,
  DRONE_ELITE_TELEGRAPH_TIME,
  DRONE_FLANK_OFFSET,
  DRONE_FIRE_COOLDOWN,
  DRONE_FLASH_SEC,
  DRONE_LINEAR_DAMPING,
  DRONE_MAX_CLOSE_CHASERS,
  DRONE_MAX_SIMULTANEOUS_ATTACKERS,
  DRONE_MAX_SPEED,
  DRONE_MASS,
  DRONE_ORBIT_RADIUS_MAX,
  DRONE_ORBIT_RADIUS_MIN,
  DRONE_ORBITER_LINEAR_DAMPING,
  DRONE_ORBITER_RADIUS_MULT,
  DRONE_PACE_MOVE_MIN,
  DRONE_PACE_PAUSE_MIN,
  DRONE_PERSONAL_OFFSET_RANGE,
  DRONE_RADIUS,
  DRONE_SEPARATION_RADIUS,
  DRONE_SEPARATION_WEIGHT,
  DRONE_SHOOTER_AIM_JITTER,
  DRONE_SHOOTER_FLEE_BOOST,
  DRONE_SHOOTER_FIRE_MAX_DIST,
  DRONE_SHOOTER_FIRE_MIN_DIST,
  DRONE_SHOOTER_IDEAL_DIST,
  DRONE_SHOOTER_AIM_TIME,
  DRONE_SHOOTER_PHASE_COOLDOWN,
  DRONE_SHOOTER_SPEED,
  DRONE_SURROUND_MIN,
  DRONE_SURROUND_RING_BLEND,
  DRONE_SURROUND_RING_R,
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
    addCombatShake = () => {},
    onDroneKill,
  } = deps;

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
  let lastPx = 0;
  let lastPz = 0;
  let haveLastPlayer = false;

  function isShotBlocked(drone, b, px, py, pz) {
    const mx = (b.position.x + px) * 0.5;
    const mz = (b.position.z + pz) * 0.5;
    for (const other of drones) {
      if (other === drone || other.dying) continue;
      const ox = other.body.position.x;
      const oz = other.body.position.z;
      const dx = ox - mx;
      const dz = oz - mz;
      if (dx * dx + dz * dz < 6.25) return true;
    }
    return false;
  }

  function pickBehaviorType() {
    const r = Math.random();
    if (r < 0.45) return DRONE_TYPE_CHASER;
    if (r < 0.8) return DRONE_TYPE_ORBITER;
    return DRONE_TYPE_SHOOTER;
  }

  function pickEliteVariant() {
    const r = Math.random();
    if (r < 0.34) return 'sniper';
    if (r < 0.67) return 'burst';
    return 'charger';
  }

  function applyEliteVariantMaterial(mat, variant) {
    if (variant === 'sniper') {
      mat.color.setHex(0x5599ff);
      mat.emissive.setHex(0x2244aa);
      mat.emissiveIntensity = 2.35;
    } else if (variant === 'burst') {
      mat.color.setHex(0xff5533);
      mat.emissive.setHex(0x881100);
      mat.emissiveIntensity = 2.35;
    } else {
      mat.color.setHex(0xffcc22);
      mat.emissive.setHex(0x886600);
      mat.emissiveIntensity = 2.35;
    }
  }

  /**
   * Visual agresivo: núcleo + pinchos (sin tocar física; el cuerpo sigue siendo esfera).
   */
  function buildGeometricDroneVisual(coreMaterial, physicsRadius, opts = {}) {
    const spikeCount = opts.spikeCount ?? 9;
    const spikeMat = coreMaterial.clone();
    spikeMat.color.multiplyScalar(0.52);
    spikeMat.emissive.multiplyScalar(0.62);

    const root = new THREE.Group();
    const visualRig = new THREE.Group();
    root.add(visualRig);

    const coreR = physicsRadius * 0.44;
    const coreGeo = new THREE.IcosahedronGeometry(coreR, 0);
    const coreMesh = new THREE.Mesh(coreGeo, coreMaterial);
    coreMesh.castShadow = true;
    coreMesh.receiveShadow = true;
    visualRig.add(coreMesh);

    const coneR = physicsRadius * 0.2;
    const coneH = physicsRadius * 0.52;
    const coneGeo = new THREE.ConeGeometry(coneR, coneH, 5);
    const up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < spikeCount; i++) {
      const y = 1 - (2 * (i + 0.5)) / spikeCount;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const t = golden * (i + 0.3 * Math.sin(i * 2.1));
      const dir = new THREE.Vector3(Math.cos(t) * rr, y, Math.sin(t) * rr).normalize();
      const spike = new THREE.Mesh(coneGeo, spikeMat);
      q.setFromUnitVectors(up, dir);
      spike.quaternion.copy(q);
      const dist = coreR * 0.72 + coneH * 0.38;
      pos.copy(dir).multiplyScalar(dist);
      spike.position.copy(pos);
      spike.rotation.z += (Math.random() - 0.5) * 0.12;
      spike.castShadow = true;
      spike.receiveShadow = true;
      visualRig.add(spike);
    }

    return {
      group: root,
      visualRig,
      materials: [coreMaterial, spikeMat],
      disposeGeometries: () => {
        coreGeo.dispose();
        coneGeo.dispose();
      },
    };
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
    const eliteVariant = elite ? opts.eliteVariant ?? pickEliteVariant() : null;
    const behaviorType = elite
      ? DRONE_TYPE_CHASER
      : opts.behaviorType ?? pickBehaviorType();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x4a4a55,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0xff0505,
      emissiveIntensity: 1.35,
    });
    let baseEmissiveIntensity = 1.35;
    if (elite && eliteVariant) {
      applyEliteVariantMaterial(mat, eliteVariant);
      baseEmissiveIntensity = mat.emissiveIntensity;
    } else if (elite) {
      mat.color.setHex(0x5a4868);
      mat.emissive.setHex(0x7722ff);
      baseEmissiveIntensity = 1.7;
      mat.emissiveIntensity = baseEmissiveIntensity;
    } else {
      applyArcadeDroneMaterial(mat, behaviorType);
    }

    const radius = elite ? ELITE_DRONE_RADIUS : DRONE_RADIUS;
    const visual = buildGeometricDroneVisual(mat, radius, {
      spikeCount: elite ? 12 : 9,
    });
    const mesh = visual.group;
    mesh.position.set(x, y, z);
    const meshBaseScale = elite ? (eliteVariant ? 1.12 : 1.05) : 1;
    mesh.scale.setScalar(meshBaseScale);
    if (elite && !eliteVariant) {
      const shield = new THREE.Mesh(eliteShieldGeo, eliteShieldMat);
      shield.scale.setScalar(1.26);
      mesh.add(shield);
    }
    scene.add(mesh);
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
    const id = nextDroneId++;
    const drone = {
      id,
      mesh,
      visualRig: visual.visualRig,
      droneMaterials: visual.materials,
      disposeDroneGeometries: visual.disposeGeometries,
      body,
      elite,
      eliteVariant,
      eliteHp: elite ? DRONE_ELITE_HP : 0,
      eliteAiState: elite && eliteVariant ? 'reposition' : null,
      eliteStateTimer: 0,
      telegraphTimer: 0,
      chargeTimer: 0,
      tacticalRole: 'pressure',
      pacePhase: 'move',
      paceTimer: 0.35 + (id % 7) * 0.09,
      speedJitter: 0.92 + Math.random() * 0.14,
      meshBaseScale,
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
      if (drone.elite && drone.eliteHp > 0) {
        drone.eliteHp -= 1;
        if (drone.eliteHp > 0) return;
      }
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
    if (drone.elite && !allowElite && drone.eliteHp > 0) return;
    drone.dying = true;
    drone.deathPhase = 0;
    world.removeBody(drone.body);
    for (const m of drone.droneMaterials) {
      m.emissive.setHex(0xff6666);
      m.emissiveIntensity = 5;
      m.color.setHex(0xffffff);
    }

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

    const pvx = haveLastPlayer ? (px - lastPx) / Math.max(dt, 1e-5) : 0;
    const pvz = haveLastPlayer ? (pz - lastPz) / Math.max(dt, 1e-5) : 0;
    lastPx = px;
    lastPz = pz;
    haveLastPlayer = true;

    const orbiters = [];
    for (const d of drones) {
      if (!d.dying && d.behaviorType === DRONE_TYPE_ORBITER) orbiters.push(d);
    }
    orbiters.sort((a, b) => a.id - b.id);
    const nOrb = orbiters.length;
    for (let i = 0; i < nOrb; i++) orbiters[i]._orbitSlot = i;

    const chasersT = [];
    for (const d of drones) {
      if (!d.dying && d.behaviorType === DRONE_TYPE_CHASER && !d.elite)
        chasersT.push(d);
    }
    chasersT.sort((a, b) => a.id - b.id);
    const nChT = chasersT.length;
    for (let i = 0; i < nChT; i++) {
      const ch = chasersT[i];
      if (nChT >= DRONE_SURROUND_MIN) {
        ch.tacticalRole = 'surround';
        ch._surroundSlot = i;
      } else {
        ch.tacticalRole = (['pressure', 'flank', 'block'])[i % 3];
      }
    }

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

    const attackCandidates = [];
    for (const d of drones) {
      if (d.dying || d.elite) continue;
      const b = d.body;
      const dxP = px - b.position.x;
      const dyP = py - b.position.y;
      const dzP = pz - b.position.z;
      const dist = Math.sqrt(dxP * dxP + dyP * dyP + dzP * dzP);
      if (d.behaviorType === DRONE_TYPE_SHOOTER) {
        if (
          dist >= DRONE_SHOOTER_FIRE_MIN_DIST &&
          dist <= DRONE_SHOOTER_FIRE_MAX_DIST
        ) {
          attackCandidates.push({ d, dist });
        }
      } else if (
        dist >= DRONE_ATTACK_MIN_DIST &&
        dist <= DRONE_ATTACK_MAX_DIST
      ) {
        attackCandidates.push({ d, dist });
      }
    }
    attackCandidates.sort((a, b) => a.dist - b.dist);
    const attackAllowed = new Set(
      attackCandidates
        .slice(0, DRONE_MAX_SIMULTANEOUS_ATTACKERS)
        .map((x) => x.d)
    );

    const fireBasic = (b) =>
      createEnemyProjectile(b.position.x, b.position.y, b.position.z, px, py, pz);

    const fireShooter = (drone, b) => {
      if (!attackAllowed.has(drone)) return;
      if (isShotBlocked(drone, b, px, py, pz)) return;
      createEnemyProjectile(
        b.position.x,
        b.position.y,
        b.position.z,
        px,
        py,
        pz,
        { jitter: DRONE_SHOOTER_AIM_JITTER }
      );
    };

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

      if (d.behaviorType !== DRONE_TYPE_SHOOTER && !d.elite) {
        d.aimInAttackBand = inAttackBand;
        if (inAttackBand && attackAllowed.has(d)) {
          d.shootTimer += dt;
          if (d.shootTimer >= DRONE_FIRE_COOLDOWN) {
            d.shootTimer = 0;
            fireBasic(b);
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

      if (d.elite && d.eliteVariant) {
        const v = d.eliteVariant;
        const inRange =
          distToPlayer >= DRONE_ATTACK_MIN_DIST &&
          distToPlayer <= DRONE_ATTACK_MAX_DIST;
        if (v === 'sniper') {
          if (!inRange) {
            d.eliteAiState = 'reposition';
            d.telegraphTimer = 0;
          } else if (d.eliteAiState === 'reposition' && hDist > 8) {
            d.eliteAiState = 'aim';
            d.eliteStateTimer = 0.22;
          } else if (d.eliteAiState === 'aim') {
            d.eliteStateTimer -= dt;
            if (d.eliteStateTimer <= 0) {
              d.eliteAiState = 'telegraph';
              d.telegraphTimer = DRONE_ELITE_TELEGRAPH_TIME;
            }
          } else if (d.eliteAiState === 'telegraph') {
            d.telegraphTimer -= dt;
            if (d.telegraphTimer <= 0) {
              createEnemyProjectile(
                b.position.x,
                b.position.y,
                b.position.z,
                px,
                py,
                pz,
                {
                  speedMult: DRONE_ELITE_SNIPER_SHOT_SPEED_MULT,
                  jitter: 0.03,
                }
              );
              addCombatShake(0.5);
              d.eliteAiState = 'cooldown';
              d.eliteStateTimer = DRONE_ELITE_SNIPER_COOLDOWN;
            }
          } else if (d.eliteAiState === 'cooldown') {
            d.eliteStateTimer -= dt;
            if (d.eliteStateTimer <= 0) d.eliteAiState = 'reposition';
          }
        } else if (v === 'burst') {
          if (!inRange) {
            d.eliteAiState = 'reposition';
          } else if (d.eliteAiState === 'reposition' && hDist > 9) {
            d.eliteAiState = 'telegraph';
            d.telegraphTimer = DRONE_ELITE_TELEGRAPH_TIME;
          } else if (d.eliteAiState === 'telegraph') {
            d.telegraphTimer -= dt;
            if (d.telegraphTimer <= 0) {
              const ox0 = b.position.x;
              const oy0 = b.position.y;
              const oz0 = b.position.z;
              const n = DRONE_ELITE_BURST_RAYS;
              for (let k = 0; k < n; k++) {
                const ang = (k / n) * Math.PI * 2;
                const txb = ox0 + Math.cos(ang) * 12;
                const tzb = oz0 + Math.sin(ang) * 12;
                createEnemyProjectile(ox0, oy0, oz0, txb, py, tzb, {
                  speedMult: DRONE_ELITE_BURST_SPEED_MULT,
                });
              }
              addCombatShake(0.65);
              d.eliteAiState = 'cooldown';
              d.eliteStateTimer = DRONE_ELITE_SNIPER_COOLDOWN;
            }
          } else if (d.eliteAiState === 'cooldown') {
            d.eliteStateTimer -= dt;
            if (d.eliteStateTimer <= 0) d.eliteAiState = 'reposition';
          }
        } else if (v === 'charger') {
          if (d.eliteAiState === 'charging') {
            d.chargeTimer -= dt;
            if (d.chargeTimer <= 0) {
              d.eliteAiState = 'cooldown';
              d.eliteStateTimer = 2.1;
            }
          } else if (d.eliteAiState === 'cooldown') {
            d.eliteStateTimer -= dt;
            if (d.eliteStateTimer <= 0) d.eliteAiState = 'reposition';
          } else if (!inRange) {
            d.eliteAiState = 'reposition';
          } else if (d.eliteAiState === 'reposition' && hDist < 14 && hDist > 0.08) {
            d.eliteAiState = 'telegraph';
            d.telegraphTimer = DRONE_ELITE_CHARGE_TELEGRAPH;
          } else if (d.eliteAiState === 'telegraph') {
            d.telegraphTimer -= dt;
            if (d.telegraphTimer <= 0) {
              d.eliteAiState = 'charging';
              d.chargeTimer = DRONE_ELITE_CHARGE_DURATION;
              addCombatShake(0.35);
            }
          }
        }
        d.aimInAttackBand =
          distToPlayer >= DRONE_ATTACK_MIN_DIST &&
          distToPlayer <= DRONE_ATTACK_MAX_DIST;
      }

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
            d.stateTimer =
              DRONE_SHOOTER_AIM_TIME * (0.88 + Math.random() * 0.2);
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
              fireShooter(d, b);
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

      if (d.behaviorType === DRONE_TYPE_CHASER && !d.elite) {
        d.paceTimer -= dt;
        if (d.paceTimer <= 0) {
          d.pacePhase = d.pacePhase === 'move' ? 'pause' : 'move';
          d.paceTimer =
            d.pacePhase === 'pause'
              ? DRONE_PACE_PAUSE_MIN + Math.random() * 0.18
              : DRONE_PACE_MOVE_MIN + Math.random() * 0.28;
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
        } else if (d.elite && d.eliteVariant) {
          const v = d.eliteVariant;
          if (v === 'charger' && d.eliteAiState === 'charging') {
            moveSpeed = DRONE_ELITE_CHARGE_SPEED;
            if (hDist > 0.08) {
              const inv = 1 / hDist;
              tx = px + hdx * inv * 1;
              tz = pz + hdz * inv * 1;
            }
          } else {
            if (
              d.eliteAiState === 'telegraph' ||
              d.eliteAiState === 'aim' ||
              (v === 'charger' && d.eliteAiState === 'telegraph')
            ) {
              moveSpeed = 0;
            } else if (d.eliteAiState === 'cooldown') {
              moveSpeed *= 0.42;
            }
            if (hDist > 0.08) {
              const inv = 1 / hDist;
              tx = px + hdx * inv * 17;
              tz = pz + hdz * inv * 17;
            }
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
          moveSpeed *= DRONE_CHASER_SPEED_MULT * d.speedJitter;
          let roleApplied = false;
          if (
            bt === DRONE_TYPE_CHASER &&
            !coordHold &&
            nChT >= DRONE_SURROUND_MIN &&
            d.tacticalRole === 'surround'
          ) {
            const idx = d._surroundSlot ?? 0;
            const a = (idx / Math.max(nChT, 1)) * Math.PI * 2;
            const Rs = DRONE_SURROUND_RING_R;
            let sx = px + Math.cos(a) * Rs;
            let sz = pz + Math.sin(a) * Rs;
            sx += (px - sx) * DRONE_SURROUND_RING_BLEND;
            sz += (pz - sz) * DRONE_SURROUND_RING_BLEND;
            tx = sx;
            tz = sz;
            roleApplied = true;
          } else if (
            bt === DRONE_TYPE_CHASER &&
            !coordHold &&
            d.tacticalRole === 'flank'
          ) {
            const plen = Math.sqrt(pvx * pvx + pvz * pvz);
            if (plen > 0.55) {
              const invp = 1 / plen;
              const perpX = -pvz * invp;
              const perpZ = pvx * invp;
              const sign = d.id % 2 === 0 ? 1 : -1;
              tx = px + perpX * DRONE_FLANK_OFFSET * sign + hdx * 0.18;
              tz = pz + perpZ * DRONE_FLANK_OFFSET * sign + hdz * 0.18;
            } else if (hDist > 0.1) {
              const inv = 1 / hDist;
              tx = px + (-hdz * inv) * DRONE_FLANK_OFFSET * (d.id % 2 === 0 ? 1 : -1);
              tz = pz + (hdx * inv) * DRONE_FLANK_OFFSET * (d.id % 2 === 0 ? 1 : -1);
            }
            roleApplied = true;
          } else if (
            bt === DRONE_TYPE_CHASER &&
            !coordHold &&
            d.tacticalRole === 'block'
          ) {
            const plen = Math.sqrt(pvx * pvx + pvz * pvz);
            if (plen > 0.45) {
              const invp = 1 / plen;
              tx = px + pvx * invp * DRONE_BLOCK_DIST;
              tz = pz + pvz * invp * DRONE_BLOCK_DIST;
            } else {
              const tcx = -px;
              const tcz = -pz;
              const tl = Math.sqrt(tcx * tcx + tcz * tcz);
              if (tl > 0.2) {
                tx = px + (tcx / tl) * DRONE_BLOCK_DIST;
                tz = pz + (tcz / tl) * DRONE_BLOCK_DIST;
              }
            }
            roleApplied = true;
          }
          if (coordHold) {
            moveSpeed *= DRONE_COORD_HOLD_SPEED_MULT;
            const holdR = DRONE_CLOSE_CHASE_RADIUS + 6.2;
            const spread = (d.id * 2.399963229728653) % (Math.PI * 2);
            tx = px + Math.cos(spread) * holdR;
            tz = pz + Math.sin(spread) * holdR;
          } else if (
            !roleApplied &&
            hDist > 0.08 &&
            distToPlayer < DRONE_ATTACK_MIN_DIST
          ) {
            const inv = 1 / hDist;
            const ringR = DRONE_ATTACK_MIN_DIST + 2;
            tx = px + hdx * inv * ringR;
            tz = pz + hdz * inv * ringR;
          }
          if (
            d.behaviorType === DRONE_TYPE_CHASER &&
            d.pacePhase === 'pause' &&
            !coordHold
          ) {
            moveSpeed *= 0.38;
          }
        }
      }

      if (
        d.elite &&
        d.eliteVariant === 'charger' &&
        d.eliteAiState === 'charging'
      ) {
        if (hDist > 0.08) {
          const inv = 1 / hDist;
          b.velocity.x = hdx * inv * DRONE_ELITE_CHARGE_SPEED;
          b.velocity.z = hdz * inv * DRONE_ELITE_CHARGE_SPEED;
        } else {
          b.velocity.x = 0;
          b.velocity.z = 0;
        }
        b.velocity.y = 0;
        continue;
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
        const ei = 5 * (1 - t) + 2 * t;
        for (const m of d.droneMaterials) m.emissiveIntensity = ei;
      } else {
        const shrink = Math.max(
          0,
          1 - (d.deathPhase - DRONE_FLASH_SEC) * DRONE_DEATH_SHRINK_SPEED
        );
        d.mesh.scale.setScalar(shrink);
        if (shrink <= 0.02) {
          scene.remove(d.mesh);
          d.disposeDroneGeometries?.();
          for (const m of d.droneMaterials) m.dispose();
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
      const baseSc = d.meshBaseScale ?? 1;
      if (d.telegraphTimer > 0) {
        const pulse = 1 + 0.1 * Math.sin(performance.now() * 0.024 + d.id);
        d.mesh.scale.setScalar(baseSc * pulse);
      } else {
        d.mesh.scale.setScalar(baseSc);
      }
      let emissiveBoost = 0;
      if (d.elite && d.eliteVariant && d.telegraphTimer > 0) {
        emissiveBoost = 1.15;
      } else if (!d.elite && d.behaviorType === DRONE_TYPE_SHOOTER) {
        const atk =
          d.aiState === 'aiming' || d.aiState === 'attacking';
        emissiveBoost = atk ? DRONE_ATTACKING_EMISSIVE_BOOST : 0;
      }
      const nMat = d.droneMaterials.length;
      for (let mi = 0; mi < nMat; mi++) {
        const m = d.droneMaterials[mi];
        const mul = mi === 0 ? 1 : 0.78;
        m.emissiveIntensity = d.baseEmissiveIntensity * mul + emissiveBoost;
      }
      if (d.aimInAttackBand) {
        d.mesh.lookAt(playerTarget.position);
        if (d.visualRig) d.visualRig.rotation.set(0, 0, 0);
      } else if (d.visualRig) {
        d.mesh.rotation.set(0, 0, 0);
        const t = performance.now() * 0.001;
        d.visualRig.rotation.y = t * 0.42 + d.id * 0.73;
        d.visualRig.rotation.x = Math.sin(t * 0.55 + d.id * 0.31) * 0.075;
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
