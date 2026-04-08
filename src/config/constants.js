/**
 * Constantes de balance y reglas (Fase 1 del refactor).
 * No importar Three/Cannon aquí para mantener el módulo puro.
 */

/** Altura de los ojos respecto al suelo (m). ~1,74 ≈ persona ~1,80 m; más alto que antes para apuntar abajo sin “clavar” en el plano. */
export const PLAYER_EYE_HEIGHT = 1.74;
export const MOVE_SPEED = 12;
/** Sprint (Shift): multiplicador sobre MOVE_SPEED; gasta stamina. */
export const SPRINT_SPEED_MULT = 1.58;
export const STAMINA_MAX = 100;
export const STAMINA_REGEN_PER_SEC = 24;
export const STAMINA_DRAIN_SPRINT_PER_SEC = 44;
export const STAMINA_JUMP_COST = 26;
export const STAMINA_HOVER_DRAIN_PER_SEC = 36;
/** Impulso vertical inicial al saltar (m/s). */
export const PLAYER_JUMP_VELOCITY = 10.2;
/** Empuje hacia arriba mientras mantienes espacio en el aire (levitar). */
export const PLAYER_HOVER_UP_ACCEL = 18;
/** Gravedad del jugador (m/s²) cuando está en el aire. */
export const PLAYER_MOVE_GRAVITY = 28;
/** Puntos base por kill antes del multiplicador. */
export const SCORE_PER_KILL_BASE = 100;
/** Incremento del multiplicador por kill consecutivo sin recibir daño. */
export const COMBO_MULT_PER_KILL = 0.12;
export const COMBO_MULT_MAX = 3.5;
/** Radio horizontal para empujar al jugador fuera de muros del laberinto. */
export const PLAYER_WALL_RADIUS = 0.48;
/** Alcance máximo del rayo de telequinesis (más pequeño = “escudo” más ajustado). */
export const GRAB_REACH = 18;
export const PULL_GAIN = 10;
export const PULL_MAX_SPEED = 28;
export const LAUNCH_SPEED = 42;
export const LAUNCH_PROJECTILE_MULT = 1.5;

export const PROJ_RADIUS = 0.22;
export const PROJ_MASS = 0.16;
/** Radio solo visual (balas más visibles para apuntar/agarrar). */
export const PROJ_VISUAL_SCALE = 2;
/** Esfera invisible grande solo para el raycaster (más fácil “pescar”). */
export const PROJ_PICK_RADIUS = 0.58;
export const BULLET_TIME_NEAR_DIST = 5;
export const BULLET_TIME_SCALE = 0.2;
/** Más lento = tiempo de reacción y telequinesis jugables. */
export const PROJ_ENEMY_SPEED = 19;
/** Banda donde pueden disparar (m): más ancha = disparan desde más lejos. */
export const DRONE_ATTACK_MIN_DIST = 6.5;
export const DRONE_ATTACK_MAX_DIST = 34;
/** No metralleta; más rápido que el 3 s del commit base. */
export const DRONE_FIRE_COOLDOWN = 1.65;

/** Tipos de IA (arcade): más chasers, menos shooters. */
export const DRONE_TYPE_CHASER = 'chaser';
export const DRONE_TYPE_ORBITER = 'orbiter';
export const DRONE_TYPE_SHOOTER = 'shooter';
/** Ráfaga tirador: disparos seguidos y pausa larga (s). */
export const DRONE_BURST_COUNT = 3;
export const DRONE_BURST_SHOT_DELAY = 0.14;
export const DRONE_BURST_RELOAD = 2.0;
/** Tirador: velocidad y distancia preferida al jugador (XZ); huyen un poco más si te acercas. */
export const DRONE_SHOOTER_SPEED = 3.9;
export const DRONE_SHOOTER_IDEAL_DIST = 20;
/** Cuando está más cerca que ideal, suma (ideal − hDist) × este factor a la distancia objetivo. */
export const DRONE_SHOOTER_FLEE_BOOST = 0.85;
/** Orbitador: radio algo mayor + giro más lento = trayectoria más suave; damping más alto = menos nervioso. */
export const DRONE_ORBIT_RADIUS_MIN = 10;
export const DRONE_ORBIT_RADIUS_MAX = 15;
export const DRONE_ORBIT_ANGULAR_SPEED = 0.88;
export const DRONE_ORBITER_RADIUS_MULT = 1.22;
export const DRONE_ORBITER_ANGULAR_MULT = 0.68;
export const DRONE_ORBITER_LINEAR_DAMPING = 0.28;
/** Chaser: algo más rápido que la base. */
export const DRONE_CHASER_SPEED_MULT = 1.2;

/** --- IA V2: separación, coordinación, tirador por fases */
export const DRONE_SEPARATION_RADIUS = 2.85;
/** Mezcla del vector de separación con la dirección deseada (0–1). */
export const DRONE_SEPARATION_WEIGHT = 0.45;
/** Distancia horizontal jugador–dron para contar “cerca” (solo chasers). */
export const DRONE_CLOSE_CHASE_RADIUS = 9.5;
/** Cuántos chasers pueden presionar a máxima velocidad en ese radio. */
export const DRONE_MAX_CLOSE_CHASERS = 3;
export const DRONE_COORD_HOLD_SPEED_MULT = 0.38;
/** Tirador: fases aim → burst → cooldown; solo disparar en esta banda. */
export const DRONE_SHOOTER_FIRE_MIN_DIST = 7;
export const DRONE_SHOOTER_FIRE_MAX_DIST = 31;
export const DRONE_SHOOTER_AIM_TIME = 0.5;
/** Pausa tras ráfaga antes del siguiente ciclo (s). */
export const DRONE_SHOOTER_PHASE_COOLDOWN = 2.0;
/** Bonus de emissive al apuntar/disparar (tiradores). */
export const DRONE_ATTACKING_EMISSIVE_BOOST = 0.65;

/** --- IA V3: roles, rodeo, presupuesto de ataque, élite */
export const DRONE_SURROUND_MIN = 5;
export const DRONE_SURROUND_RING_R = 14.5;
export const DRONE_SURROUND_RING_BLEND = 0.28;
export const DRONE_FLANK_OFFSET = 9.5;
export const DRONE_BLOCK_DIST = 11;
/** Máximo de drones que pueden disparar a la vez (slots globales). */
export const DRONE_MAX_SIMULTANEOUS_ATTACKERS = 3;
/** Cuántos de esos slots pueden ocupar tiradores (el resto: chaser/orbiter). */
export const DRONE_MAX_ATTACK_SLOTS_SHOOTERS = 2;
export const DRONE_SHOOTER_AIM_JITTER = 0.85;
/** Élite: telegráfico antes de ataque fuerte (s). */
export const DRONE_ELITE_TELEGRAPH_TIME = 0.55;
export const DRONE_ELITE_SNIPER_COOLDOWN = 2.4;
export const DRONE_ELITE_SNIPER_SHOT_SPEED_MULT = 1.82;
export const DRONE_ELITE_BURST_RAYS = 6;
export const DRONE_ELITE_BURST_SPEED_MULT = 1.15;
export const DRONE_ELITE_CHARGE_TELEGRAPH = 0.6;
export const DRONE_ELITE_CHARGE_SPEED = 26;
export const DRONE_ELITE_CHARGE_DURATION = 0.48;
export const DRONE_ELITE_HP = 3;
export const DRONE_PACE_PAUSE_MIN = 0.28;
export const DRONE_PACE_MOVE_MIN = 0.75;

/** Un poco generoso: balas rápidas a veces “atravesaban” la hitbox en un paso de física. */
export const PLAYER_HIT_RADIUS = 0.64;
/** Escalón automático (sube bordes bajos al caminar). */
export const PLAYER_STEP_HEIGHT = 0.38;
export const PLAYER_STEP_BOOST_VELOCITY = 3.15;
export const PLAYER_STEP_PROBE = 0.42;
/**
 * Tope de desplazamiento horizontal por fotograma (m). Con dt alto o sprint, evita
 * “teletransporte” XZ que pierde contacto con rampas y falla el snap al suelo.
 */
export const PLAYER_MAX_HORIZ_DISPLACE_PER_FRAME = 0.24;
/** Radio del cilindro central de la cápsula (× hit). */
export const PLAYER_CAPSULE_RADIUS_MULT = 0.92;

export const DRONE_RADIUS = 0.38;
/** Solo malla Three.js; el cuerpo físico sigue siendo la esfera DRONE_RADIUS. */
export const DRONE_VISUAL_SCALE_MULT = 1.62;
export const DRONE_MASS = 0.55;
/** Evita spawnear la bala dentro del cuerpo del dron (solapamiento = empuje aleatorio del solver). */
export const PROJ_SPAWN_CLEARANCE = DRONE_RADIUS + PROJ_RADIUS + 0.1;
/** Velocidad máxima de desplazamiento (unidades/s). */
export const DRONE_MAX_SPEED = 8.6;
/** Qué tan rápido alcanzan esa velocidad (steering). */
export const DRONE_STEER_STRENGTH = 6.2;
/** Tope de fuerza de steering (sin contar compensación de gravedad). */
export const DRONE_MAX_FORCE = 40;
/** Amortiguación lineal del cuerpo (menos = más ágiles). */
export const DRONE_LINEAR_DAMPING = 0.18;
export const SPAWN_INTERVAL = 5;
/** Anillo de aparición alrededor del jugador: radio interior / exterior. */
export const SPAWN_RING_INNER = 22;
export const SPAWN_RING_OUTER = 36;
/** Cada dron persigue un punto cerca del jugador, no el mismo centro (evita amontonarse). */
export const DRONE_PERSONAL_OFFSET_RANGE = 2.2;
export const CUBE_KILL_DRONE_SPEED = 16;
export const DRONE_DEATH_SHRINK_SPEED = 7;
export const DRONE_FLASH_SEC = 0.12;
export const MAX_DRONES = 36;
/** Pausa entre olas (s). */
export const WAVE_BETWEEN_MIN_SEC = 1.5;
export const WAVE_BETWEEN_MAX_SEC = 3;
/** Cartel central “WAVE N” visible (ms). */
export const WAVE_BANNER_DURATION_MS = 1200;
/** Enemigo élite: más grande, escudo morado; solo muere por explosión de combinación. */
export const ELITE_DRONE_RADIUS = 0.62;
export const ELITE_DRONE_MASS = 1.05;
/** Cada N enemigos normales derrotados aparece un élite. */
export const ELITE_SPAWN_EVERY_NORMAL_KILLS = 10;

/** --- Prueba: `true` = no spawn de drones; `TEST_MODE_DUAL_MG` = dos ametralladoras fijas. */
export const TEST_MODE_NO_DRONES = false;
export const TEST_MODE_DUAL_MG = false;
export const TEST_MG_FIRE_INTERVAL = 3;
export const TEST_MG_A = Object.freeze({ x: -20, y: 1.6, z: -35 });
export const TEST_MG_B = Object.freeze({ x: 24, y: 1.8, z: 30 });

export const HAND_SIZE_PX = 292;
/** Mano derecha (telequinesis): fracción del ancho a la derecha del centro. */
export const HAND_RIGHT_ANCHOR_X_FRAC = 0.1;
/** Mano izquierda (escudo): espejo de la textura de la derecha, simétrica en X. */
export const HAND_LEFT_ANCHOR_X_FRAC = -0.1;
/** Fracción del alto: negativo = por debajo del centro. */
export const HAND_ANCHOR_Y_FRAC = -0.4;
export const HAND_EXTENDED_MS = 200;
export const HAND_KICK_X = 14;
export const HAND_KICK_Y = 18;

/** Distancia recorrida máxima por proyectil enemigo (trayectoria recta). */
export const PROJ_MAX_PATH_TRAVEL = 120;
/** Telequinesis / lanzamiento aliado (sin plasma): debe alcanzar paredes lejanas del arena. */
export const PROJ_FRIENDLY_STRAIGHT_MAX_PATH = 520;
/** Segundos máximos de vida (respaldo). */
export const PROJ_MAX_LIFE = 40;
/** Modo burbuja (rebotes): sin tope de distancia; solo edad y escape del mapa. */
export const PROJ_BUBBLE_MAX_LIFE = 120;
/** Disparos rectos: cuánta gravedad del mundo se “anula” (0 = caen normal; 1 = vuelo horizontal como antes). */
export const PROJ_GRAVITY_CANCEL_STRAIGHT = 0.52;
/** Mezcla velocidad Y física tras integrar (cae un poco aunque apuntes recto). */
export const PROJ_GRAVITY_BLEND_Y = 0.38;
/** Fusión bala+bala → rayo plasma (aliado, atraviesa drones). */
export const PROJ_PLASMA_SPEED = 64;
export const PROJ_PLASMA_MAX_PATH = 240;
export const PROJ_PLASMA_PIERCE_COUNT = 16;
/** Cada fusión bala+bala sobre el plasma ya agarrado: más grande y más penetraciones. */
export const PLASMA_MAX_TIER = 14;
export const PLASMA_RADIUS_GROWTH = 1.082;
export const PLASMA_PIERCE_PER_STACK = 5;
export const PLASMA_VISUAL_GROW_PER_TIER = 0.1;
export const PLASMA_PICK_SCALE_PER_TIER = 0.085;
/** Cubo+bala → explosión al impacto fuerte / suelo / dron. */
export const EXPLOSIVE_CUBE_BLAST_RADIUS = 5.2;
export const EXPLOSIVE_ARM_DELAY_MS = 380;
export const EXPLOSIVE_DETONATE_SPEED = 2.0;
/** Cubo+cubo → mega bloque (2 m de lado). */
export const MEGA_CUBE_HALF = 1;
export const MEGA_CUBE_MASS = 6;
export const MEGA_CUBE_COLOR = 0x6a7a9e;
/** Telaraña: vibración visual y resaltado del par (Tab). */
export const VORTEX_JITTER_AMP = 0.024;
/** Rosa: objetos del par que vas a fusionar (preview + animación E). */
export const FUSION_PREVIEW_GLOW = 0xff4da6;
export const FUSION_PREVIEW_TINT = 0xffb8e0;
export const FUSION_LINE_COLOR = 0xff66c4;
export const FUSION_PREVIEW_INTENSITY_CUBE = 1.25;
export const FUSION_PREVIEW_INTENSITY_PROJ = 2.65;
/** Mismo límite horizontal que el jugador (cámara clamp ±ARENA_HALF). Fuera → se elimina el disparo enemigo. */
export const ARENA_HALF = 58;
/** Modo misión: arena más grande (sin sensación de “habitación” pequeña). */
export const MISSION_ARENA_HALF = 168;
/** Enemigos iniciales repartidos por el mapa (modo misión). */
export const MISSION_PATROL_DRONE_COUNT = 14;
export const ARENA_Y_MIN = -2;
export const ARENA_Y_MAX = 80;
/** Límites físicos del arena (paredes; más gruesas = menos tunelado a alta velocidad). */
export const ARENA_WALL_HALF_THICK = 1.25;
export const ARENA_WALL_HEIGHT = 46;
/** Pelotas tipo ping-pong: rápidas, más elásticas; siguen hasta pegar dron. */
export const BUBBLE_WALL_RESTITUTION = 0.82;
export const BUBBLE_GROUND_RESTITUTION = 0.76;
export const BUBBLE_SPEED_RETENTION = 0.78;
export const BUBBLE_MAX_SPEED = 40;
export const BUBBLE_MIN_SPEED = 20;
/** Impulso aleatorio suave (rompe rebotes perfectos hacia la misma línea). */
export const BUBBLE_RANDOM_IMPULSE = 1.35;
/** Explosión de combinación: barrido esférico invisible (radio 0→max) en 0,5 s; partículas amarillas. */
export const FUSION_EXPLOSION_TRIGGER_DURATION = 0.5;
export const FUSION_EXPLOSION_TRIGGER_MAX_RADIUS = 5;
export const FUSION_EXPLOSION_PARTICLE_COUNT = 80;
export const FUSION_EXPLOSION_PARTICLE_LIFE = 1;
export const FUSION_EXPLOSION_LIGHT_DURATION = 0.45;
export const FUSION_EXPLOSION_SHAKE_BASE = 0.2;
export const FUSION_IMPACT_MIN_SPEED_CUBE = 10;

/** Combinación magnética (escudo + vórtice). */
export const VORTEX_RADIUS = 3;
export const VORTEX_DIST = 2.05;
export const VORTEX_LERP = 7;
export const VORTEX_ORBIT_R = 0.48;
export const FUSION_SPEED = 32;
/** Distancia entre centros para completar fusión (subir si falla cubo↔bala). */
export const FUSION_MERGE_DIST = 0.38;
/** Evita spawnear el cubo de fusión con el centro bajo el suelo (penetración → caída/explosión rara). */
export const FUSION_SPAWN_GROUND_CLEARANCE = 0.07;
/** Tras lanzar con RMB, no volver a atrapar en el vórtice (evita anular el disparo). */
export const VORTEX_LAUNCH_IMMUNE_MS = 1200;
/** Máximo de cuerpos en la telaraña magnética (cubos + proyectiles). */
export const VORTEX_MAX_CAPTURED = 5;

/** Proyectiles enemigos: grupo propio para no chocar entre sí. */
export const COLLISION_GROUP_ENEMY_PROJECTILE = 2;
/** Cuerpos de drones: las balas enemigas los ignoran (ven el flag y continúan). */
export const COLLISION_GROUP_DRONE = 4;
/** Balas enemigas excluyen proyectiles enemigos y cuerpos de drones. */
export const COLLISION_MASK_ENEMY_PROJECTILE =
  -1 ^ COLLISION_GROUP_ENEMY_PROJECTILE;
/** Drones ignoran balas enemigas (excluyen su grupo del mask). */
export const COLLISION_MASK_DRONE =
  -1 ^ COLLISION_GROUP_ENEMY_PROJECTILE;
/** Hitbox del jugador: los proyectiles en telaraña dejan de colisionar con este grupo. */
export const COLLISION_GROUP_PLAYER_BODY = 256;
/** Distancia mínima deseada entre centros de drones (separación). */
export const DRONE_SEPARATION_DIST = 4.0;
/** Fuerza de repulsión entre drones cuando están demasiado juntos. */
export const DRONE_SEPARATION_FORCE = 18;
/**
 * Pareja en fusión magnética: filtros cruzados para que no colisionen entre sí
 * (el proyectil es muy ligero y el solver lo expulsaba del cubo cada frame).
 */
export const COLLISION_GROUP_FUSION_A = 32;
export const COLLISION_GROUP_FUSION_B = 64;
