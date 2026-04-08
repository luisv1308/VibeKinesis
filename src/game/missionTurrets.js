import * as THREE from 'three';
import * as CANNON from 'cannon-es';

/**
 * Torretas estáticas: giran hacia el jugador, disparan con LOS, destructibles.
 */
export function createMissionTurretSystem(deps) {
  const {
    scene,
    world,
    playerTarget,
    createEnemyProjectile,
    lineOfSightBlocked,
    worldStaticPhysicsMaterial,
    registerPhysicsObject,
  } = deps;

  const turrets = [];
  const FIRE_INTERVAL = 2.15;
  const _barrelWorld = new THREE.Vector3();

  function spawnMissionTurret(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      metalness: 0.35,
      roughness: 0.55,
      emissive: 0x1a2030,
      emissiveIntensity: 0.35,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xff5533,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x661100,
      emissiveIntensity: 0.9,
    });

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.62, 0.42, 10),
      baseMat
    );
    base.position.y = 0.21;
    base.castShadow = true;
    group.add(base);

    const mount = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.28, 0.55),
      baseMat
    );
    mount.position.y = 0.52;
    mount.castShadow = true;
    group.add(mount);

    const yaw = new THREE.Group();
    yaw.position.y = 0.62;
    group.add(yaw);

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.38, 0.5),
      accentMat
    );
    housing.position.set(0, 0.2, 0);
    housing.castShadow = true;
    yaw.add(housing);

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, 0.55, 8),
      accentMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.22, -0.42);
    barrel.castShadow = true;
    yaw.add(barrel);

    scene.add(group);

    const shape = new CANNON.Box(new CANNON.Vec3(0.4, 0.55, 0.4));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(x, y + 0.55, z);
    body.material = worldStaticPhysicsMaterial;
    body.userData = {
      wall: true,
      isMissionTurret: true,
    };
    world.addBody(body);
    registerPhysicsObject({ body, mesh: group, kind: 'missionTurret' });

    const entry = {
      group,
      yaw,
      barrel,
      body,
      hp: 5,
      dead: false,
      fireCd: FIRE_INTERVAL * 0.35,
    };
    body.userData.turretEntry = entry;
    turrets.push(entry);
  }

  function damageTurret(entry, dmg = 1) {
    if (!entry || entry.dead) return;
    entry.hp -= dmg;
    if (entry.hp > 0) return;
    entry.dead = true;
    world.removeBody(entry.body);
    scene.remove(entry.group);
    entry.group.traverse((ch) => {
      if (ch.geometry) ch.geometry.dispose();
    });
    const mi = turrets.indexOf(entry);
    if (mi >= 0) turrets.splice(mi, 1);
  }

  function update(dt) {
    const px = playerTarget.position.x;
    const py = playerTarget.position.y;
    const pz = playerTarget.position.z;

    for (const t of turrets) {
      if (t.dead) continue;
      t.body.position.set(
        t.group.position.x,
        t.group.position.y + 0.55,
        t.group.position.z
      );

      const dx = px - t.group.position.x;
      const dz = pz - t.group.position.z;
      t.yaw.rotation.y = Math.atan2(dx, dz);

      t.fireCd -= dt;
      if (t.fireCd > 0) continue;

      t.barrel.getWorldPosition(_barrelWorld);
      const ox = _barrelWorld.x;
      const oy = _barrelWorld.y;
      const oz = _barrelWorld.z;
      if (lineOfSightBlocked(ox, oy, oz, px, py, pz)) continue;

      createEnemyProjectile(ox, oy, oz, px, py, pz, { jitter: 0.04 });
      t.fireCd = FIRE_INTERVAL;
    }
  }

  function syncMeshesFromBodies() {
    for (const t of turrets) {
      if (t.dead) continue;
      t.group.position.x = t.body.position.x;
      t.group.position.z = t.body.position.z;
      t.group.position.y = t.body.position.y - 0.55;
    }
  }

  function clearAll() {
    for (const t of [...turrets]) {
      damageTurret(t, 999);
    }
    turrets.length = 0;
  }

  function aliveCount() {
    return turrets.filter((t) => !t.dead).length;
  }

  return {
    spawnMissionTurret,
    update,
    syncMeshesFromBodies,
    damageTurret,
    clearAll,
    aliveCount,
  };
}
