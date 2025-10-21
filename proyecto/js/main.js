var loader;
var renderer, scene, camera;
var cameraControls;
var generadorTerreno;

//* Parametros del terreno
const tamanyo = 250;       // ancho y largo del terreno
const segmentos = 1;      // numero de subdivisiones


var player;         // objeto que representa el jugador
var angulo = -0.01;
var mixer = null;
const clock = new THREE.Clock();

const stats = new Stats();
let enemiesHUD = null; // pequeño HUD para mostrar nº de enemigos
let oleadaActual = 1; // Oleada actual
const DEBUG = false; // activar helpers de debug

// Terreno y raycasting para seguir la superficie
var terrainMesh = null;
var raycaster = new THREE.Raycaster();
var playerFootOffset = 0; // desplazamiento desde el origen del modelo hasta los pies

// Array de posiciones de árboles para colisión
var arboles = []; // { x, z, radio }

// animaciones del jugador
const A_IDLE = 0;
const A_WALK = 1;
const A_RUN = 2;
const A_HIT = 3;
const A_DEATH = 4;

let actions = {};
// Array para almacenar los nombres de las animaciones
let animationNames = [];
// Índice actual de la animacion
let currentAnimationIndex = 0;

var p_pos = new THREE.Vector3(0,0,0);
var velocity = new THREE.Vector3(0,0,0);

var listener;
var audioLoader;
var musicaOn = false;

// Audio global de música de fondo (declarado aquí para usarlo en handlers)
var backgroundMusic;

var sonidoGolpe;

var juegoPausado = false;


// Estado del jugador
var playerState = {
  health: 100,           // Vida actual del jugador
  maxHealth: 100,        // Vida máxima
  coins: 0,              // Monedas del jugador
  isHit: false,          // Si está recibiendo daño actualmente
  isAttacking: false,    // Si está ejecutando animación de ataque
  hitAnimDuration: 0.2,  // Duración de la animacion de daño en segundos
  attackAnimDuration: 0.2, // Duración de la animación de ataque
  invulnerableTime: 0.3, // Tiempo de invulnerabilidad después de recibir daño
  lastHitTime: 0         // Timestamp del último golpe recibido
};

const controls = {
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  runForward: false,
  speedWalk: 0.1,
  speedRun: 0.2,
};

var nPowerups = 15; // numero de power-ups a generar
//ENEMIGOS

var nEnemigos = 5; // numero de enemigos a generar
var enemies = [];   // array de enemigos
var enemyModel = null; // modelo base para clonar enemigos
var enemyAnimations = {}; // animaciones cargadas del enemigo (compartidas por todos)

// Configuracion de enemigos
const enemyConfig = {
  speed: 0.05,        // velocidad de movimiento hacia el jugador
  rotationSpeed: 0.1, // velocidad de rotacion hacia el objetivo
  stopDistance: 1,  // distancia a la que dejan de perseguir (para evitar solapamiento)
  updateTerrainEveryNFrames: 5, // cada cuantos frames se actualiza la altura (5 = cada 5 frames por enemigo)
  life: 100,
  attackRange: 1.5,   // Rango de ataque al jugador (distancia)
  attackRangeSq: 2.25, // Rango al cuadrado (1.5 * 1.5)
  attackDamage: 15,    // Daño que hace al jugador
  attackCooldown: 2.0,  // Tiempo entre ataques (segundos)
  visibilityRadius: 1.2, // Radio aproximado para prueba de visibilidad en frustum
  animationUpdateDistance: 50, // distancia a la que mantenemos animaciones activas aunque no se vean
  animationUpdateDistanceSq: 2500 // precalculo: 50^2
};

// Configuracion de ataque del jugador
const attackConfig = {
  radius: 3,           // Radio del area de ataque (esfera invisible alrededor del jugador)
  radiusSq: 9,         // Radio al cuadrado para optimizar calculos (evitar sqrt)
  cooldown: 1.0,       // Tiempo entre ataques en segundos
  damage: 20,          // Daño por ataque
  knockbackForce: 1.0,     // Impulso total aplicado (unidades aproximadas)
  knockbackDuration: 0.25, // Duración en segundos durante la cual se aplica el knockback
  projectileSpeed: 12,    // Velocidad de la bola de energía (unidades/seg)
  projectileSize: 0.12,   // Radio de la esfera de proyectil
  projectileColor: 0x66ccff // Color visual del proyectil
};

// Estado del sistema de ataque
var attackState = {
  lastAttackTime: 0,   // Timestamp del ultimo ataque
  currentTarget: null  // Enemigo actualmente siendo atacado
};

// Helper visual para el area de ataque (solo si DEBUG esta activo)
var attackRangeHelper = null;

// Sistema de proyectiles
var projectiles = []; // { mesh, target, alive, velocity: {x,z}, damage }

// Cargar textura para proyectiles (una vez)
let projectileTexture = null;
function getProjectileTexture() {
  if (!projectileTexture) {
    const loader = new THREE.TextureLoader();
    projectileTexture = loader.load('images/fuego.jpg');
    projectileTexture.wrapS = THREE.RepeatWrapping;
    projectileTexture.wrapT = THREE.RepeatWrapping;
  }
  return projectileTexture;
}

function spawnProjectile(fromPos, targetEnemy, damage) {
  // Crear una pequeña esfera texturizada
  const geom = new THREE.SphereGeometry(attackConfig.projectileSize, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ 
    map: getProjectileTexture(),
    color: 0xffffff
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(fromPos.x, fromPos.y + 1.2, fromPos.z); // un poco por encima
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  // Calcular dirección hacia el enemigo (en XZ), mantener Y del proyectil más o menos constante
  const dx = targetEnemy.position.x - mesh.position.x;
  const dz = targetEnemy.position.z - mesh.position.z;
  const len = Math.sqrt(dx*dx + dz*dz) || 1;
  const vx = (dx / len) * attackConfig.projectileSpeed;
  const vz = (dz / len) * attackConfig.projectileSpeed;

  projectiles.push({ 
    mesh, 
    target: targetEnemy, 
    alive: true, 
    velocity: { x: vx, z: vz }, 
    damage,
    spawnTime: clock.getElapsedTime() // TTL start timestamp
  });
}

function updateProjectiles(delta) {
  if (projectiles.length === 0) return;

  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.alive) { continue; }

    // TTL: eliminar proyectiles con vida > 3s
    const now = clock.getElapsedTime();
    if (p.spawnTime !== undefined && (now - p.spawnTime) > 3.0) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    // Si el objetivo murio o fue eliminado, destruir proyectil
    if (!enemies.includes(p.target) || (p.target.userData && p.target.userData.muerto)) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
      continue;
    }

    // Avanzar el proyectil
    p.mesh.position.x += p.velocity.x * delta;
    p.mesh.position.z += p.velocity.z * delta;

    // Mantener una altura aproximada a media altura del enemigo
    p.mesh.position.y = p.target.position.y + 1.2;

    // Comprobar impacto (distancia XZ pequeña)
    const dx = p.target.position.x - p.mesh.position.x;
    const dz = p.target.position.z - p.mesh.position.z;
    const distSq = dx*dx + dz*dz;
    if (distSq < 0.15 * 0.15) {
      // Impacto: aplicar daño y eliminar proyectil
      // Usamos la rutina de daño ya existente, pero sin reproducir anim de Knock si prefieres
      // Aquí llamamos a la función atacarAlImpacto en lugar de aplicar daño directo para reutilizar lógica
      aplicarDanyoEnemigo(p.target, p.damage);
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

//Power-ups
const powerupTypes = {
  HEALTH: {
    name: 'health',
    color: 0x00ff00,      // Verde
    size: 0.25,
    healAmount: 10,       // Curación
    description: 'Vida +30'
  },
  RANGE: {
    name: 'range',
    color: 0x0088ff,      // Azul
    size: 0.25,
    rangeBoost: 1.1,      // Multiplicador de rango permanente
    description: 'Rango +10%'
  },
  DAMAGE: {
    name: 'damage',
    color: 0xff0000,      // Rojo
    size: 0.25,
    damageBoost: 5,      // Daño adicional permanente
    description: 'Daño +5'
  },
  COINS: {
    name: 'coins',
    color: 0xffff00,      // Amarillo
    size: 0.25,
    coinAmount: 10,       // Monedas que da
    description: 'Monedas +10'
  }
};

var powerups = []; // { mesh, type, floatTime, baseY }

function spawnPowerup(type, position) {
  const config = powerupTypes[type];
  if (!config) return;
  
  const geometry = new THREE.SphereGeometry(config.size, 16, 16);
  const material = new THREE.MeshBasicMaterial({ 
    color: config.color
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position.x, position.y + 0.5, position.z);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);
  
  powerups.push({
    mesh: mesh,
    type: type,
    floatTime: Math.random() * Math.PI * 2, // Offset aleatorio para animación
    baseY: position.y + 0.5
  });
}

function updatePowerups(delta) {
  if (!player || powerups.length === 0) return;
  
  const playerPos = player.position;
  const pickupRadiusSq = 1.0 * 1.0; // Radio de recogida al cuadrado
  
  for (let i = powerups.length - 1; i >= 0; i--) {
    const powerup = powerups[i];
    
    // Animación de flotación
    powerup.floatTime += delta * 2;
    powerup.mesh.position.y = powerup.baseY + Math.sin(powerup.floatTime) * 0.2;
    powerup.mesh.rotation.y += delta * 1.5; // Rotación
    
    // Comprobar colisión con jugador
    const dx = powerup.mesh.position.x - playerPos.x;
    const dz = powerup.mesh.position.z - playerPos.z;
    const distSq = dx * dx + dz * dz;
    
    if (distSq < pickupRadiusSq) {
      // ¡Recogido!
      applyPowerupEffect(powerup.type);
      scene.remove(powerup.mesh);
      powerups.splice(i, 1);
    }
  }
}

function applyPowerupEffect(type) {
  const config = powerupTypes[type];
  if (!config) return;
  
  switch(type) {
    case 'HEALTH':
      // Curar al jugador
      const healAmount = config.healAmount;
      playerState.health = Math.min(playerState.health + healAmount, playerState.maxHealth);
      
      // Efecto visual: flash verde
      if (player && player.traverse) {
        player.traverse((child) => {
          if (child.isMesh && child.material) {
            const originalColor = child.material.color.clone();
            child.material.color.setHex(0x00ff00);
            setTimeout(() => {
              child.material.color.copy(originalColor);
            }, 200);
          }
        });
      }
      break;
      
    case 'RANGE':
      // Aumentar rango de ataque PERMANENTEMENTE
      attackConfig.radius *= config.rangeBoost;
      attackConfig.radiusSq = attackConfig.radius * attackConfig.radius;
      
      // Actualizar helper visual si está activo
      if (attackRangeHelper) {
        const base = attackRangeHelper.userData && attackRangeHelper.userData.baseRadius ? attackRangeHelper.userData.baseRadius : attackConfig.radius;
        const ratio = attackConfig.radius / base;
        attackRangeHelper.scale.set(ratio, ratio, ratio);
      }
      break;
      
    case 'DAMAGE':
      // Aumentar daño PERMANENTEMENTE
      attackConfig.damage += config.damageBoost;

      if (player && player.traverse) {
        player.traverse((child) => {
          if (child.isMesh && child.material) {
            const originalColor = child.material.color.clone();
            child.material.color.setHex(0xff0000);
            setTimeout(() => {
              child.material.color.copy(originalColor);
            }, 200);
          }
        });
      }

      break;
      
    case 'COINS':
      // Dar monedas al jugador
      const coinAmount = config.coinAmount;
      playerState.coins = (playerState.coins || 0) + coinAmount;
      console.log(`+${coinAmount} monedas! Total: ${playerState.coins}`);
      
      // Efecto visual: flash amarillo
      if (player && player.traverse) {
        player.traverse((child) => {
          if (child.isMesh && child.material) {
            const originalColor = child.material.color.clone();
            child.material.color.setHex(0xffff00);
            setTimeout(() => {
              child.material.color.copy(originalColor);
            }, 200);
          }
        });
      }
      break;
  }
}

function spawnRandomPowerups(count) {
  if (!terrainMesh) return;
  
  const types = ['HEALTH', 'RANGE', 'DAMAGE', 'COINS'];
  
  for (let i = 0; i < count; i++) {
    // Posición aleatoria en el terreno
    const x = (Math.random() - 0.5) * tamanyo * 0.8;
    const z = (Math.random() - 0.5) * tamanyo * 0.8;
    
    // Raycast para obtener altura del terreno
    const rayOrigin = new THREE.Vector3(x, 100, z);
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(terrainMesh, false);
    
    if (hits.length > 0) {
      const y = hits[0].point.y;
      // Tipo aleatorio
      const randomType = types[Math.floor(Math.random() * types.length)];
      spawnPowerup(randomType, new THREE.Vector3(x, y, z));
    }
  }
  
}

// Configuracion de camara en tercera persona
const cameraConfig = {
    distance: 8,        // Distancia detras del jugador
    height: 4,          // Altura sobre el jugador
    smoothness: 0.1     // Factor de suavizado (0-1, menor = mas suave)
};

var cameraTarget = new THREE.Vector3();
var cameraPosition = new THREE.Vector3();

// Vectores temporales para enemigos (reutilizables, evita crear objetos cada frame)
const _enemyDir = new THREE.Vector3();
const enemyRayOrigin = new THREE.Vector3();
const _enemyRayDir = new THREE.Vector3(0, -1, 0);

// Frustum culling para enemigos, actualizar enemigos que son visibles
const frustum = new THREE.Frustum();
const cameraViewProjectionMatrix = new THREE.Matrix4();
// Esfera temporal para prueba de visibilidad (evita asignaciones por frame)
const _visibilitySphere = new THREE.Sphere();

// Event listeners para controles
// Key handlers: prevent default browser behavior for movement keys when no modifier is pressed
document.addEventListener('keydown', (event) => {
  // Si se mantiene Ctrl/Meta/Alt, respetar atajos del navegador
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Si el jugador está muerto, ignorar entradas
  if (playerState && playerState.isDead) return;

  // Si el juego está en pausa, bloquear entradas excepto ESC para reanudar
  if (juegoPausado && event.code !== 'Escape') return;

  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      controls.moveForward = true;
      break;
    case 'ArrowDown':
    case 'KeyS':
      controls.moveBackward = true;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      controls.moveLeft = true;
      break;
    case 'ArrowRight':
    case 'KeyD':
      controls.moveRight = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      controls.runForward = true;
      break;
    case 'Enter':
      playerState.health = playerState.maxHealth;
      break;
    case 'KeyI':
    case 'Keyi':
      forzarSiguienteOleada();
      break;
    
    case 'Keyp':
    case 'KeyP':

       attackConfig.damage += 10;
      break;
    
    case 'KeyM':
    case 'Keym':
      musicaOn = !musicaOn;
      if (musicaOn) {
        backgroundMusic.play();
      } else {
        backgroundMusic.pause();
      }
      break;
    
    case 'Escape':
      cambiarPausa();
      break;
      }
});

// Resetear flags cuando se suelta la tecla
document.addEventListener('keyup', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  // Si el jugador está muerto, ignorar entradas
  if (playerState && playerState.isDead) return;

  switch (event.code) {
    case 'ArrowUp':
    case 'KeyW':
      controls.moveForward = false;
      break;
    case 'ArrowDown':
    case 'KeyS':
      controls.moveBackward = false;
      break;
    case 'ArrowLeft':
    case 'KeyA':
      controls.moveLeft = false;
      break;
    case 'ArrowRight':
    case 'KeyD':
      controls.moveRight = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      controls.runForward = false;
      break;
  }
});


init();
render();

function init()
{
  renderer = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  // Color de limpiar alineado con la noche para integrarse con la niebla
  renderer.setClearColor( new THREE.Color(0x101020) );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('container').appendChild( renderer.domElement );

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101020); // Fondo oscuro
  // Niebla exponencial para limitar visibilidad a lo lejos (noche)
  scene.fog = new THREE.FogExp2(0x101020, 0.03);
  // Luz ambiental tenue
  const ambient = new THREE.AmbientLight(0x404060, 0.25);
  scene.add(ambient);
  // Luz direccional muy suave (opcional)
  const moonLight = new THREE.DirectionalLight(0x8888ff, 0.15);
  moonLight.position.set(20, 50, -20);
  // Las sombras direccionales son costosas; desactiva si necesitas rendimiento
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.width = 1024;
  moonLight.shadow.mapSize.height = 1024;
  moonLight.shadow.camera.near = 10;
  moonLight.shadow.camera.far = 100;
  moonLight.shadow.camera.left = -50;
  moonLight.shadow.camera.right = 50;
  moonLight.shadow.camera.top = 50;
  moonLight.shadow.camera.bottom = -50;
  scene.add(moonLight);
  // Luz que sigue al mago
  const mageLight = new THREE.PointLight(0xaaaaff, 0.75, 10); // Luz sin sombras para rendimiento
  mageLight.position.set(0, 2, 0);
  mageLight.castShadow = false;
  scene.add(mageLight);
  window.mageLight = mageLight;

  var aspectRatio = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera( 50, aspectRatio , 0.1, 100 );
  camera.position.set( 8, 10, -8 );
  camera.lookAt(0,1,0);

  // OrbitControls opcional - se puede desactivar si prefieres solo camara en 3ª persona
  cameraControls = new THREE.OrbitControls( camera, renderer.domElement );
  cameraControls.target.set( 0, 2, 0 );
  cameraControls.enabled = false; // Desactivar para usar camara en tercera persona

  window.addEventListener('resize', updateAspectRatio );

  stats.showPanel(0);	// FPS inicialmente. Picar para cambiar panel.
	document.getElementById( 'container' ).appendChild( stats.domElement );

  // Crear HUD simple para mostrar el numero de enemigos
  enemiesHUD = document.createElement('div');
  enemiesHUD.style.position = 'absolute';
  enemiesHUD.style.top = '5.0rem';
  enemiesHUD.style.left = '0.5rem';
  enemiesHUD.style.padding = '4px 8px';
  enemiesHUD.style.background = 'rgba(0,0,0,0.4)';
  enemiesHUD.style.color = '#fff';
  enemiesHUD.style.font = '12px monospace';
  enemiesHUD.style.borderRadius = '4px';
  enemiesHUD.textContent = 'Enemigos Restantes: 0';
  document.getElementById('container').appendChild(enemiesHUD);

  // Crear HUD para mostrar la vida del jugador
  const healthHUD = document.createElement('div');
  healthHUD.id = 'healthHUD';
  healthHUD.style.position = 'absolute';
  healthHUD.style.top = '6.5rem';
  healthHUD.style.left = '0.5rem';
  healthHUD.style.padding = '4px 8px';
  healthHUD.style.background = 'rgba(0,0,0,0.4)';
  healthHUD.style.color = '#0f0';
  healthHUD.style.font = '12px monospace';
  healthHUD.style.borderRadius = '4px';
  healthHUD.textContent = `Vida: ${playerState.health}/${playerState.maxHealth}`;
  document.getElementById('container').appendChild(healthHUD);

  // Crear HUD para mostrar el daño del jugador
  const damageHUD = document.createElement('div');
  damageHUD.id = 'damageHUD';
  damageHUD.style.position = 'absolute';
  damageHUD.style.top = '8.0rem';
  damageHUD.style.left = '0.5rem';
  damageHUD.style.padding = '4px 8px';
  damageHUD.style.background = 'rgba(0,0,0,0.4)';
  damageHUD.style.color = '#f00';
  damageHUD.style.font = '12px monospace';
  damageHUD.style.borderRadius = '4px';
  damageHUD.textContent = `Daño: ${attackConfig.damage}`;
  document.getElementById('container').appendChild(damageHUD);

  // Crear HUD para mostrar la oleada actual
  const waveHUD = document.createElement('div');
  waveHUD.id = 'waveHUD';
  waveHUD.style.position = 'absolute';
  waveHUD.style.top = '9.5rem';
  waveHUD.style.left = '0.5rem';
  waveHUD.style.padding = '4px 8px';
  waveHUD.style.background = 'rgba(0,0,0,0.4)';
  waveHUD.style.color = '#fff';
  waveHUD.style.font = '12px monospace';
  waveHUD.style.borderRadius = '4px';
  waveHUD.textContent = `Oleada: ${oleadaActual}`;
  document.getElementById('container').appendChild(waveHUD);

  // Crear HUD para mostrar las monedas
  const coinsHUD = document.createElement('div');
  coinsHUD.id = 'coinsHUD';
  coinsHUD.style.position = 'absolute';
  coinsHUD.style.top = '11.0rem';
  coinsHUD.style.left = '0.5rem';
  coinsHUD.style.padding = '4px 8px';
  coinsHUD.style.background = 'rgba(0,0,0,0.4)';
  coinsHUD.style.color = '#ff0';
  coinsHUD.style.font = '12px monospace';
  coinsHUD.style.borderRadius = '4px';
  coinsHUD.textContent = `Monedas: ${playerState.coins}`;
  document.getElementById('container').appendChild(coinsHUD);

  // Crear instancia del generador de terreno
  generadorTerreno = new GeneradorTerreno(tamanyo, segmentos);
  
  // Generar y añadir terreno a la escena
  crearTerrenoCompleto();

  loadModelAndAnimations();
  loadEnemyModelAndAnimations();
  // Generar 5 enemigos aleatorios (optimizado)
  // spawnEnemiesEfficient(5);

  // Crear helper visual del area de ataque (esfera transparente)
  const attackRangeGeometry = new THREE.SphereGeometry(attackConfig.radius, 32, 32);
  const attackRangeMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.01,    // Transparencia muy baja
    wireframe: false, // Sólida, no wireframe
    side: THREE.DoubleSide
  });
  attackRangeHelper = new THREE.Mesh(attackRangeGeometry, attackRangeMaterial);
  // Guardar el radio base para escalar correctamente tras power-ups de rango
  attackRangeHelper.userData.baseRadius = attackConfig.radius;
  scene.add(attackRangeHelper);

  //Musica de fondo
  listener = new THREE.AudioListener();
  camera.add( listener );

  // Cargar la música de fondo
  backgroundMusic = new THREE.Audio( listener );
  audioLoader = new THREE.AudioLoader();
  // Cargar música (ajusta la ruta según tu archivo)
  audioLoader.load('sounds/background_music.mp3', function(buffer) {
    backgroundMusic.setBuffer(buffer);
    backgroundMusic.setLoop(true);
    backgroundMusic.setVolume(0.3); // Volumen moderado (0.0 - 1.0)
  }, function(){
    musicaOn = true;
    backgroundMusic.play();
  }, function(error) {
    console.warn('No se pudo cargar la música de fondo:', error);
  });

    // Sonido de disparo
  sonidoGolpe = new THREE.Audio(listener);
  audioLoader.load('sounds/disparo.wav', function(buffer) {
    sonidoGolpe.setBuffer(buffer);
    sonidoGolpe.setLoop(false);
    sonidoGolpe.setVolume(0.4); // Volumen del disparo
    console.log('Sonido de disparo cargado correctamente');
  }, undefined, function(error) {
    console.warn('No se pudo cargar el sonido de disparo:', error);
  });

}

/**
 * Añade helpers de debug (esfera y BoxHelper) a todos los enemigos
 */
function addEnemyDebugHelpers() {
  enemies.forEach(e => {
    // Esfera roja como marcador de cabeza
    if (!e.userData || !e.userData.headMarker) {
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff4444 })
      );
      marker.position.set(0, 1.8, 0);
      e.add(marker);
      e.userData = e.userData || {};
      e.userData.headMarker = marker;
    }

    // BoxHelper verde para el bounding box
    if (!e.userData.boxHelper) {
      const bh = new THREE.BoxHelper(e, 0x00ff00);
      scene.add(bh);
      e.userData.boxHelper = bh;
    }
  });
}

function updateAspectRatio()
{
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function loadModelAndAnimations() {
  const loader = new THREE.FBXLoader();

  // Cargar modelo base
  loader.load('models/mago/Ch39_nonPBR.fbx', function (object) {

    player = object;
    scene.add(object);
    object.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    // Vamos a ajustar el tamaño del mesh para que su altura sea 2 metros.
    var box = new THREE.Box3().setFromObject(object);
    var size = new THREE.Vector3();
    box.getSize(size);
    var s = 2.0 / size.y;
    object.scale.set(s,s,s);

    // Recalcular bounding box tras escalar para conocer el desplazamiento a los pies
    box.setFromObject(object);
    // La mínima Y del modelo (pies) en coordenadas del mundo
    playerFootOffset = -box.min.y; // distancia desde el origen del modelo hasta el suelo


    mixer = new THREE.AnimationMixer(object);

    // Ajustar materiales
    object.traverse(function (child) {
          if (child.isMesh) {
              child.material.transparent = false;
              child.material.opacity = 1.0;
          }
      });

    // Cargar y aplicar animaciones
    const animations = [
      'models/mago/Idle.fbx', 
      'models/mago/WalkForward.fbx',
      'models/mago/RunForward.fbx',
      'models/mago/Hit.fbx',  // Animación de recibir daño
      'models/mago/Death.fbx',
      'models/mago/Atack.fbx' // Animación de ataque (opcional)
    ];
    animations.forEach(function (animFile, index) {
        loader.load(animFile, function (animData) {
            // Extraer el nombre del archivo sin la ruta ni la extension .fbx
            const name = animFile.split('/').pop().split('.').slice(0, -1).join('.');
            const action = mixer.clipAction(animData.animations[0]);
            actions[name] = action; // Guardar la accion con el nombre del archivo
            animationNames[index] = name; // Almacenar nombre de animacion en el array

            // Si es la primera animacion (Idle), empezamos con ella
            if (index === 0) {
              action.play();
              currentAnimationIndex = 0;
            }
          });
    });

    }, undefined, function (error) { console.error(error);
  });
  
}

function loadEnemyModelAndAnimations(){
  const loader = new THREE.FBXLoader();
  loader.load('models/enemigo/enemigo.fbx', function (object) {
    // Guardar prototipo del enemigo (no añadir a escena)
    enemyModel = object;
    enemyModel.name = 'EnemyPrototype';
    // Ajustar tamaño una vez (altura ~2m)
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    box.getSize(size);
    var s = 2.0 / size.y;
    object.scale.set(s, s, s);

    // Ajustar materiales basicos si procede
    enemyModel.traverse(function (child) {
      if (child.isMesh) {
        child.material.transparent = false;
        child.material.opacity = 1.0;
      }
    });

    // Ahora que el prototipo esta listo, podemos cargar sus animaciones
    loadEnemyAnimations(loader);
    
    }, undefined, function (error) { console.error(error);
  });
}

/**
 * Carga las animaciones del enemigo (compartidas por todos los enemigos)
 */
function loadEnemyAnimations(loader) {
  const animFiles = [
    'models/enemigo/Atack.fbx',
    'models/enemigo/Walk.fbx',
    'models/enemigo/Death.fbx',
    'models/enemigo/Hit.fbx'
  ];
  
  let loadedCount = 0;
  
  animFiles.forEach((animFile, index) => {
    loader.load(animFile, function(animData) {
      const animName = animFile.split('/').pop().split('.')[0];
      enemyAnimations[animName] = animData.animations[0];
      
      loadedCount++;
      
      // Cuando todas las animaciones estén cargadas, spawnear enemigos
      if (loadedCount === animFiles.length) {
        spawnEnemiesEfficient(nEnemigos);
        spawnRandomPowerups(nPowerups);
        if (DEBUG) addEnemyDebugHelpers();
      }
    }, undefined, function(error) {
      console.error(`Error cargando animación ${animFile}:`, error);
      // Intentar spawnear de todas formas (sin animaciones)
      loadedCount++;
      if (loadedCount === animFiles.length) {
        spawnEnemiesEfficient(nEnemigos);
        if (DEBUG) addEnemyDebugHelpers();
      }
    });
  });
}

function changeAnimation(index) {
  if (index === currentAnimationIndex) return;

  const newName = animationNames[index];
  const oldName = animationNames[currentAnimationIndex];

  if (!actions[newName]) {
    console.warn('Animacion no cargada aun:', newName);
    return;
  }

  const newAction = actions[newName];
  const oldAction = actions[oldName];

  // Si hay una animacion anterior, crossfade
  if (oldAction && oldAction !== newAction) {
    oldAction.crossFadeTo(newAction, 0.3, false);
    newAction.reset().play();
  }else{
    newAction.reset().play();
  }

  currentAnimationIndex = index;
}

/**
 * Reproduce la animación de daño del jugador
 * Vuelve automáticamente a Idle después de que termine
 */
function playerGolpeado() {
  if (!actions['Hit']) {
    console.warn('Animación Hit no cargada');
    return;
  }
  
  const hitAction = actions['Hit'];
  const currentAction = actions[animationNames[currentAnimationIndex]];
  
  // La animacion de hit se reproduce solo una vez
  hitAction.setLoop(THREE.LoopOnce, 1);
  hitAction.clampWhenFinished = false; // No mantener la última pose
  
  // Crossfade a la animación de Hit
  if (currentAction && currentAction !== hitAction) {
    currentAction.crossFadeTo(hitAction, 0.1, false);
  }
  
  hitAction.reset().play();
  
  // Marcar que estamos en animación de Hit
  playerState.isHit = true;
  
  // Después de que termine la animación, volver a Idle
  setTimeout(() => {
    playerState.isHit = false;

    if (!controls.moveForward && !controls.moveBackward) {
      changeAnimation(A_IDLE);
    }

  }, playerState.hitAnimDuration * 1000);
}

/**
 * Reproduce la animacion de ataque del jugador 
 */
function playerAtaqueAnim() {
  const attackAction = actions['Atack'];
  if (!attackAction) {
    // Si no existe animación de ataque, marcar el estado durante un breve periodo
    playerState.isAttacking = true;
    setTimeout(() => { 
      playerState.isAttacking = false;
      
    }, playerState.attackAnimDuration * 1000);
    return;
  }

  const currentAction = actions[animationNames[currentAnimationIndex]];
  if (currentAction && currentAction !== attackAction) {
    currentAction.crossFadeTo(attackAction, 0.1, false);
  }
  attackAction.setLoop(THREE.LoopOnce, 1);
  attackAction.clampWhenFinished = false;
  attackAction.reset().play();
  playerState.isAttacking = true;
  setTimeout(() => {
    if (playerState.isAttacking) {
      playerState.isAttacking = false;
      if (!controls.moveForward) {
        changeAnimation(A_IDLE);
        console.log("Cambio a idle tras ataque");
      }else{
        changeAnimation(A_WALK);
        console.log("Cambio a walk tras ataque");
      }
    }
  }, playerState.attackAnimDuration * 1000);

}


function golpearPlayer(damage, attacker = null) {
  const currentTime = clock.getElapsedTime();
  
  // Verificar invulnerabilidad
  if (currentTime - playerState.lastHitTime < playerState.invulnerableTime) {
    return; // Todavía invulnerable
  }
  
  // Aplicar daño
  playerState.health -= damage;
  playerState.lastHitTime = currentTime;
    
  // Reproducir animación de daño
  playerGolpeado();
  
  // Efecto visual: parpadeo rojo
  if (player && player.traverse) {
    player.traverse((child) => {
      if (child.isMesh && child.material) {
        const originalColor = child.material.color.clone();
        child.material.color.setHex(0xff0000); // Rojo
        
        setTimeout(() => {
          child.material.color.copy(originalColor);
        }, 150);
      }
    });
  }
  
  // Verificar si el jugador ha muerto
  if (playerState.health <= 0) {
    playerMuerto();
  }
}

function playerMuerto() {
  if (playerState.isDead) return; // Evitar duplicado

  playerState.health = 0;
  playerState.isDead = true;

  // Detener todo input/movimiento
  controls.moveForward = false;
  controls.moveBackward = false;
  controls.moveLeft = false;
  controls.moveRight = false;
  controls.runForward = false;

  // Reproducir animación de muerte del jugador si está cargada
  const deathAction = actions['Death'];
  if (deathAction) {
    const currentAction = actions[animationNames[currentAnimationIndex]];
    if (currentAction && currentAction !== deathAction) {
      currentAction.crossFadeTo(deathAction, 0.2, false);
    }
    deathAction.setLoop(THREE.LoopOnce, 1);
    deathAction.clampWhenFinished = true;
    deathAction.reset().play();
  }

  // Eliminar todos los enemigos de la escena
  for (const enemy of enemies) {
    // Remover helpers
    if (enemy.userData && enemy.userData.boxHelper) {
      scene.remove(enemy.userData.boxHelper);
    }
    // Detener mixers
    if (enemy.userData && enemy.userData.mixer) {
      enemy.userData.mixer.stopAllAction();
      enemy.userData.mixer = null;
    }
    // Remover del scene
    scene.remove(enemy);
  }
  // Vaciar el array
  enemies.length = 0;
}

/**
 * Funcion principal que crea y configura el terreno
 * Cambia el tipo de terreno modificando la llamada dentro de esta funcion
 */
function crearTerrenoCompleto() {
  // Rango de aleatoriedad para la generacion del terreno
  const alturaBase = 15 + Math.random() * 10; // 15-25
  const alturaMontanas = 25 + Math.random() * 14; // 25-39
  const alturaDetalles = 5 + Math.random() * 7; // 5-12
  const numArboles = 30 + Math.floor(Math.random() * 30); // 30-59

  // Generar el terreno con parámetros aleatorios
  const terreno = generadorTerreno.generarTerrenoBasico({
    alturaBase: alturaBase,
    alturaMontanas: alturaMontanas,
    alturaDetalles: alturaDetalles,
    color: 0x8B7355, // Marron tierra
    wireframe: false,
    arboles: numArboles
  });

  // Añadir el terreno a la escena
  scene.add(terreno);
  terrainMesh = terreno;

  // Limpiar array de árboles previo
  arboles = [];

  // Colocar árboles low-poly con raycast exacto sobre el terreno
  GeneradorTerreno.distribuirArbolesLowPolyRaycast(scene, terrainMesh, 200, tamanyo, arboles);

  // Añadir iluminacion optimizada
  // GeneradorTerreno.añadirIluminacion(scene);

  if (DEBUG) {
    console.log("Terreno generado y añadido a la escena", {
      alturaBase, alturaMontanas, alturaDetalles, numArboles
    });
  }
}

/**
 * Actualiza la posicion de la camara en tercera persona
 * La camara sigue al jugador con un offset suavizado
 */
function updateThirdPersonCamera() {
  if (!player) return;

  // Calcular la posicion ideal de la camara detras del jugador
  const idealOffset = new THREE.Vector3(
    -Math.sin(angulo) * cameraConfig.distance,
    cameraConfig.height,
    -Math.cos(angulo) * cameraConfig.distance
  );

  const idealPosition = new THREE.Vector3();
  idealPosition.copy(player.position).add(idealOffset);

  // Interpolar suavemente hacia la posicion ideal (lerp)
  cameraPosition.lerp(idealPosition, cameraConfig.smoothness);
  camera.position.copy(cameraPosition);

  // Calcular el punto de mira (ligeramente por encima del jugador)
  const idealTarget = new THREE.Vector3();
  idealTarget.copy(player.position);
  idealTarget.y += 1.5; // Mirar a la altura del torso/cabeza

  // Suavizar tambien el objetivo
  cameraTarget.lerp(idealTarget, cameraConfig.smoothness);
  camera.lookAt(cameraTarget);

  // Actualizar target de OrbitControls si esta habilitado
  if (cameraControls.enabled) {
    cameraControls.target.copy(cameraTarget);
  }
}

function update()
{
  // Si el juego está en pausa, no actualizar nada
  if (juegoPausado) return;

  // Actualizar OrbitControls solo si esta habilitado
  if (cameraControls.enabled) {
    cameraControls.update();
  }
  
  let delta = clock.getDelta();         // tiempo en segundos
  if (delta > 0.05) delta = 0.05; // clamp a ~20 FPS equivalente para estabilidad
  if (mixer!=null) mixer.update(delta);
  
  // Actualizar mixers de enemigos: solo si visibles o próximos al jugador
  if (enemies.length > 0) {
    const pX = player ? player.position.x : 0;
    const pZ = player ? player.position.z : 0;
    for (const enemy of enemies) {
      if (!enemy.userData.mixer) continue;
      const dxm = enemy.position.x - pX;
      const dzm = enemy.position.z - pZ;
      const d2m = dxm*dxm + dzm*dzm;
      _visibilitySphere.center.copy(enemy.position);
      _visibilitySphere.radius = enemyConfig.visibilityRadius;
      const visible = frustum.intersectsSphere(_visibilitySphere);
      if (visible || d2m <= enemyConfig.animationUpdateDistanceSq) {
        enemy.userData.mixer.update(delta);
      }
    }
  }

  if(player==null) return;

  // Actualizar enemigos
  updateEnemies(delta);
  
  // Sistema de ataque del jugador
  atacarEnemigo();

  // Actualizar proyectiles
  updateProjectiles(delta);
  
  // Actualizar power-ups
  updatePowerups(delta);

  // Calcular el vector de direccion de vista
  velocity.set(Math.sin(angulo), 0, Math.cos(angulo));
  // Actualizar el angulo basado en los controles de izquierda y derecha
  if (controls.moveLeft) angulo += 0.05;
  if (controls.moveRight) angulo -= 0.05;

  // mueve el personaje
  if (controls.moveForward) {
    const speed = controls.runForward ? controls.speedRun : controls.speedWalk;
    // Solo cambiar animación si no está recibiendo daño
    if (!playerState.isHit && !playerState.isAttacking) {
      changeAnimation(controls.runForward ? A_RUN : A_WALK);
    }
    
    // Calcular nueva posición
    const nuevaPos = p_pos.clone().add(velocity.clone().multiplyScalar(speed));
    
    // Verificar colisión con árboles
    let colisiona = false;
    const radioJugador = 0.8; // Radio de colisión del jugador
    for (let i = 0; i < arboles.length; i++) {
      const arbol = arboles[i];
      const dx = nuevaPos.x - arbol.x;
      const dz = nuevaPos.z - arbol.z;
      const distSq = dx*dx + dz*dz;
      const radioTotal = radioJugador + arbol.radio;
      if (distSq < radioTotal * radioTotal) {
        colisiona = true;
        break;
      }
    }
    
    // Solo aplicar el movimiento si no hay colisión
    if (!colisiona) {
      p_pos.copy(nuevaPos);
    }
  } else {
    // Solo cambiar a Idle si no está recibiendo daño
    if (!playerState.isHit && !playerState.isAttacking) {
      changeAnimation(A_IDLE);
    }
  }
      
  player.position.set(p_pos.x, p_pos.y, p_pos.z);
  player.rotation.y = angulo;

  // Ajustar Y del jugador al terreno
  projectPlayerToTerrain();

  // Actualizar camara en tercera persona
  updateThirdPersonCamera();

  // Hacer que la luz siga al mago
  if (window.mageLight && player) {
    window.mageLight.position.copy(player.position);
    window.mageLight.position.y += 2;
  }

  // Actualiza el monitor 
	stats.update();
  // Actualiza HUD de enemigos
  if (enemiesHUD) enemiesHUD.textContent = `Enemigos Restantes: ${enemies.length}`;
  
  // Actualizar HUD de vida del jugador
  const healthHUD = document.getElementById('healthHUD');
  if (healthHUD) {
    healthHUD.textContent = `Vida: ${playerState.health}/${playerState.maxHealth}`;
    // Cambiar color según la vida
    if (playerState.health > 60) {
      healthHUD.style.color = '#0f0'; // Verde
    } else if (playerState.health > 30) {
      healthHUD.style.color = '#ff0'; // Amarillo
    } else {
      healthHUD.style.color = '#f00'; // Rojo
    }
  }

  // Actualizar HUD de daño
  const damageHUD = document.getElementById('damageHUD');
  if (damageHUD) {
    damageHUD.textContent = `Daño: ${attackConfig.damage}`;
  }

  // Actualizar HUD de oleada
  const waveHUD = document.getElementById('waveHUD');
  if (waveHUD) {
    waveHUD.textContent = `Oleada: ${oleadaActual}`;
  }

  // Actualizar HUD de monedas
  const coinsHUD = document.getElementById('coinsHUD');
  if (coinsHUD) {
    coinsHUD.textContent = `Monedas: ${playerState.coins}`;
  }
  
  // Actualizar BoxHelpers de debug si estan activos
  if (DEBUG) {
    for (const e of enemies) {
      if (e.userData && e.userData.boxHelper) {
        e.userData.boxHelper.update();
      }
    }
  }
  
  // Actualizar helper del area de ataque para que siga al jugador (siempre)
  if (attackRangeHelper && player) {
    attackRangeHelper.position.copy(player.position);
  }
  
}

/**
 * Lanza un rayo hacia abajo desde sobre el jugador y ajusta su Y a la altura del terreno
 */
function projectPlayerToTerrain() {
  if (!terrainMesh || !player) return;

  // Punto de inicio del rayo: por encima del jugador para evitar quedar dentro del terreno
  const rayOrigin = new THREE.Vector3(player.position.x, player.position.y + 50, player.position.z);
  const rayDirection = new THREE.Vector3(0, -1, 0);

  raycaster.set(rayOrigin, rayDirection);
  const intersects = raycaster.intersectObject(terrainMesh, false);

  if (intersects.length > 0) {
    const hit = intersects[0];
    // Colocar al jugador justo sobre el terreno, compensando el offset a los pies
    player.position.y = hit.point.y + playerFootOffset + 0.02; // pequeño margen para evitar z-fighting
  }
}


function enemigosEnRango() {
  //Lista de enemigos en el rango
  const enemiesInRange = [];
  
  if (!player || enemies.length === 0) return enemiesInRange; //Si no hay enemigos o jugador no hay enemigos
  
  //Posicion del jugador
  const playerX = player.position.x;
  const playerZ = player.position.z;
  
  //Recorremos los enemigos
  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    
    // Ignorar enemigos muertos
    if (enemy.userData.muerto) {
      continue;
    }
    
    // Distancia al cuadrado del enemgio
    const dx = enemy.position.x - playerX;
    const dz = enemy.position.z - playerZ;
    const distanceSq = dx * dx + dz * dz;
    
    // Si el enemigo esta dentro del area se le puede atacar
    if (distanceSq <= attackConfig.radiusSq) {
      enemiesInRange.push(enemy);
    }
  }
  
  return enemiesInRange;
}

function atacarEnemigo() {
  const tiempoActual = clock.getElapsedTime();
  
  // Verificar si ha pasado suficiente tiempo desde el último ataque
  if (tiempoActual - attackState.lastAttackTime < attackConfig.cooldown) {
    return; // Todavia en cooldown
  }
  
  // Obtener enemigos en rango
  const enemiesInRange = enemigosEnRango();
  
  if (enemiesInRange.length === 0) {
    attackState.currentTarget = null;
    return; // No hay enemigos en rango
  }
  
  // Seleccionamos un enemigo aleatorio del rango
  const randomIndex = Math.floor(Math.random() * enemiesInRange.length);
  const targetEnemy = enemiesInRange[randomIndex];
  
  // Realizar el ataque
  atacar(targetEnemy);
  
  // Actualizar estado de ataques
  attackState.lastAttackTime = tiempoActual;
  attackState.currentTarget = targetEnemy;
}


function atacar(enemy) {
  if (!enemy || !enemy.userData) return;
  
  // Animación de ataque del mago
  playerAtaqueAnim();

    // Reproducir sonido de disparo
  if (sonidoGolpe && musicaOn) {
    if (sonidoGolpe.isPlaying) {
      sonidoGolpe.stop(); // Detener si ya está sonando para permitir overlapping
    }
    sonidoGolpe.play();
  }
  
  // Lanzar proyectil hacia el enemigo
  spawnProjectile(player.position, enemy, attackConfig.damage);
}

// Aplica daño y knockback al enemigo (reutilizable por impacto de proyectil)
function aplicarDanyoEnemigo(enemy, damage) {
  if (!enemy || !enemy.userData) return;
  if (enemy.userData.muerto) return;
  
  if (enemy.userData.health === undefined) {
    enemy.userData.health = enemyConfig.life;
  }
  enemy.userData.health -= damage;
  
  if (enemy.userData.health <= 0) {
    matarEnemigo(enemy);
    return;
  }
  
  // Knockback y animación de hit
  const dirX = enemy.position.x - player.position.x;
  const dirZ = enemy.position.z - player.position.z;
  const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1.0;
  const nx = dirX / len;
  const nz = dirZ / len;
  enemy.userData.knockback = enemy.userData.knockback || {};
  enemy.userData.knockback.remaining = attackConfig.knockbackDuration;
  const initialSpeed = attackConfig.knockbackForce / attackConfig.knockbackDuration;
  enemy.userData.knockback.vx = nx * initialSpeed;
  enemy.userData.knockback.vz = nz * initialSpeed;
  changeEnemyAnimation(enemy, 'Hit');
}

function matarEnemigo(enemy) {
  // Marcar el enemigo como muerto para evitar que se actualice
  enemy.userData.muerto = true;
  
  // Reproducir animación de muerte
  changeEnemyAnimation(enemy, 'Death');
  
  // Configurar la animación de muerte para que se reproduzca una sola vez (no loop)
  if (enemy.userData.actions && enemy.userData.actions['Death']) {
    enemy.userData.actions['Death'].setLoop(THREE.LoopOnce, 1);
    enemy.userData.actions['Death'].clampWhenFinished = true; // Mantener la última pose
  }
  
  // Después de 2 segundos, eliminar el enemigo de la escena
  setTimeout(() => {
    // Remover del array de enemigos
    const index = enemies.indexOf(enemy);
    if (index > -1) {
      enemies.splice(index, 1);
    }
    
    // Remover helper de debug si existe
    if (enemy.userData.boxHelper) {
      scene.remove(enemy.userData.boxHelper);
    }
    
    // Remover de la escena
    scene.remove(enemy);
    
    // Limpiar recursos
    if (enemy.userData.mixer) {
      enemy.userData.mixer.stopAllAction();
      enemy.userData.mixer = null;
    }
    
    // Comprobar si todos los enemigos están muertos
    checkForNewWave();
    
  }, 5000); // 5000ms = 5 segundos
}

function forzarSiguienteOleada() {
  if (playerState.isDead) return;

  // Eliminar todos los enemigos de la escena y del array (limpieza completa)
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];

    // Quitar helpers
    if (enemy.userData && enemy.userData.boxHelper) {
      scene.remove(enemy.userData.boxHelper);
    }

    // Parar mixers
    if (enemy.userData && enemy.userData.mixer) {
      enemy.userData.mixer.stopAllAction();
      enemy.userData.mixer = null;
    }

    // Sacar del scene y del array
    scene.remove(enemy);
    enemies.splice(i, 1);
  }

  // Disparar la lógica existente de nueva oleada
  checkForNewWave();
}

// Comprobar si todos los enemigos están muertos y generar nueva oleada
function checkForNewWave() {
  if (playerState.isDead) return; // No generar nuevas oleadas si el jugador ha muerto
  // Contar enemigos vivos (no muertos)
  const aliveEnemies = enemies.filter(e => !e.userData.muerto).length;
  
  if (aliveEnemies === 0 && enemies.length === 0) {
    // Incrementar oleada
    oleadaActual++;

    nEnemigos += 2; // Incrementar el número de enemigos por oleada

    // Generar 7 nuevos enemigos
    spawnEnemiesEfficient(nEnemigos);

    // Generar 15 nuevos power-ups
    spawnRandomPowerups(nPowerups);

  }
}

//Actualiza a los enemigos
function updateEnemies(delta) {
  if (!player || !terrainMesh || enemies.length === 0) return;

  // Actualizar frustum de la camara
  camera.updateMatrixWorld();
  cameraViewProjectionMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  );
  frustum.setFromProjectionMatrix(cameraViewProjectionMatrix);

  const playerX = player.position.x;
  const playerZ = player.position.z;

  //Como jugaremos con la d^2 ponemos la distancia de parada igual para poder comparar
  const stopDistSq = enemyConfig.stopDistance * enemyConfig.stopDistance;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    
    // Si el enemigo está muerto, saltar su actualización de movimiento
    if (enemy.userData.muerto) {
      continue;
    }
    
    // Inicializar contador de frames si no existe
    if (!enemy.userData.frameCount) enemy.userData.frameCount = 0;
    enemy.userData.frameCount++;
    
    // Si el enemigo tiene knockback activo, se aplica saltando el resto de movimiento
    if (enemy.userData.knockback && enemy.userData.knockback.remaining > 0) {
      const kb = enemy.userData.knockback;
      // Mover usando la velocidad de knockback integrada con delta
      enemy.position.x += kb.vx * delta;
      enemy.position.z += kb.vz * delta;
      // Reducir tiempo restante
      kb.remaining -= delta;
      if (kb.remaining <= 0) {
        enemy.userData.knockback = null;
      }
      // Ajustamos la altura del enemigo como en movimiento normal
      if (enemy.userData.frameCount % enemyConfig.updateTerrainEveryNFrames === 0) {
        enemyRayOrigin.set(enemy.position.x, enemy.position.y + 50, enemy.position.z);
        raycaster.set(enemyRayOrigin, _enemyRayDir);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits.length > 0) {
          enemy.position.y = hits[0].point.y + 0.02;
        }
      }
      // Saltar el resto de la logica de movimiento este frame
      continue;
    }

    // Calcular direccion hacia jugador
    const dx = playerX - enemy.position.x;
    const dz = playerZ - enemy.position.z;
    
    // Distancia al cuadrado, para evitar calculo jugaremos con la d^2
    const distanceSq = dx * dx + dz * dz;
    
  // Comprobar si el enemigo esta visible en la camara usando una esfera simple
  _visibilitySphere.center.copy(enemy.position);
  _visibilitySphere.radius = enemyConfig.visibilityRadius;
  const isVisible = frustum.intersectsSphere(_visibilitySphere);
    
    // Solo mover si esta mas lejos que la distancia de parada
    if (distanceSq > stopDistSq) {
      // Normalizar direccion
      const invDist = 1 / Math.sqrt(distanceSq); //Calculo de la norma del vector
      //Division de la norma por cada componente para normalizar
      const dirX = dx * invDist; 
      const dirZ = dz * invDist;
      
      // ANIMACIÓN: Cambiar a Walk cuando se mueve
      changeEnemyAnimation(enemy, 'Walk');
      
      // Mover enemigo hacia el jugador, esto se hace este visible o no
      enemy.position.x += dirX * enemyConfig.speed;
      enemy.position.z += dirZ * enemyConfig.speed;
      
      // Rotación: sólo si visible (optimización visual)
      if (isVisible) {
        const targetAngle = Math.atan2(dirX, dirZ);
        let angleDiff = targetAngle - enemy.rotation.y;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        else if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        enemy.rotation.y += angleDiff * enemyConfig.rotationSpeed;
      }

      // Altura del enemigo respecto al terreno: solo cuando es visible (rendimiento)
      if (isVisible && (enemy.userData.frameCount % enemyConfig.updateTerrainEveryNFrames === 0)) {
        enemyRayOrigin.set(enemy.position.x, enemy.position.y + 50, enemy.position.z);
        raycaster.set(enemyRayOrigin, _enemyRayDir);
        const hits = raycaster.intersectObject(terrainMesh, false);
        if (hits.length > 0) {
          enemy.position.y = hits[0].point.y + 0.02;
        }
      }
    } else if (distanceSq > 0.01) {
      // En rango cercano: atacar al jugador (sin depender de visibilidad)
      changeEnemyAnimation(enemy, 'Atack');

      if (!enemy.userData.lastAttackTime) {
        enemy.userData.lastAttackTime = 0;
      }

      const currentTime = clock.getElapsedTime();
      if (currentTime - enemy.userData.lastAttackTime >= enemyConfig.attackCooldown) {
        if (distanceSq <= enemyConfig.attackRangeSq) {
          golpearPlayer(enemy.userData.attackDamage, enemy);
          enemy.userData.lastAttackTime = currentTime;
        }
      }

      // Girar hacia el jugador solo si es visible (opcional; ahorro visual)
      if (isVisible) {
        const invDist = 1 / Math.sqrt(distanceSq);
        const dirX2 = dx * invDist;
        const dirZ2 = dz * invDist;
        const targetAngle = Math.atan2(dirX2, dirZ2);
        let angleDiff = targetAngle - enemy.rotation.y;
        if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        else if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
        enemy.rotation.y += angleDiff * enemyConfig.rotationSpeed;
      }
    }
  }
}

function spawnEnemiesEfficient(n) {
  if (!terrainMesh) return;
  if (!enemyModel) { return;}
  
  for (let i = 0; i < n; i++) {
    // Posicion aleatoria en el plano XZ del terreno
    const x = (Math.random() - 0.5) * tamanyo * 0.9;
    const z = (Math.random() - 0.5) * tamanyo * 0.9;
    // Raycast para obtener la altura Y del terreno
    const rayOrigin = new THREE.Vector3(x, 100, z);
    raycaster.set(rayOrigin, new THREE.Vector3(0, -1, 0));
    const hits = raycaster.intersectObject(terrainMesh, false);
    let y = 0;
    if (hits.length > 0) {
      y = hits[0].point.y + 0.02;
    }
    
    // Clonar el modelo base (deep clone si hay esqueleto)
    const enemy = (THREE.SkeletonUtils && THREE.SkeletonUtils.clone)? THREE.SkeletonUtils.clone(enemyModel) : enemyModel.clone();
    enemy.position.set(x, y, z);
    // Ahora los enemigos se moveran, así que necesitan matrixAutoUpdate activo
    enemy.matrixAutoUpdate = true;
    
    // Crear AnimationMixer para este enemigo
    enemy.userData.mixer = new THREE.AnimationMixer(enemy);
    enemy.userData.actions = {};
    enemy.userData.currentAction = null;
    
    // Crear acciones de animación si las animaciones están cargadas
    if (Object.keys(enemyAnimations).length > 0) {
      for (const animName in enemyAnimations) {
        const clip = enemyAnimations[animName];
        const action = enemy.userData.mixer.clipAction(clip);
        enemy.userData.actions[animName] = action;
      }
      
    }
    
    scene.add(enemy);
    enemies.push(enemy);
    enemy.traverse(function (child) {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    // Vida y daño escalados por oleada
    enemy.userData.health = Math.floor(enemyConfig.life + 10 * (oleadaActual - 1));
    enemy.userData.attackDamage = Math.floor(enemyConfig.attackDamage + 10 * (oleadaActual - 1));
    //Aumento de la velocidad por oleada
    // enemyConfig.speed = enemyConfig.baseSpeed + 0.02 * (oleadaActual - 1);
  }
  
}

function changeEnemyAnimation(enemy, newAnimName) {
  if (!enemy.userData.actions || !enemy.userData.actions[newAnimName]) {
    return; // No hay animaciones cargadas
  }
  
  if (enemy.userData.currentAction === newAnimName) {
    return; // Ya está reproduciendo esta animación
  }
  
  const newAction = enemy.userData.actions[newAnimName];
  const oldAction = enemy.userData.currentAction ? enemy.userData.actions[enemy.userData.currentAction] : null;
  
  if (oldAction && oldAction !== newAction) {
    // Crossfade suave entre animaciones
    oldAction.crossFadeTo(newAction, 0.2, false);
  }
  
  newAction.reset().play();
  enemy.userData.currentAction = newAnimName;
}

/**
 * Alternar pausa del juego
 */
function cambiarPausa() {
  juegoPausado = !juegoPausado;
  
  if (juegoPausado) {
    // Pausar música si está sonando
    if (backgroundMusic && backgroundMusic.isPlaying) {
      backgroundMusic.pause();
    }
    
    // Mostrar overlay de pausa
    cambiarPausaJuego();
  } else {
    // Reanudar música si estaba activada
    if (backgroundMusic && musicaOn) {
      backgroundMusic.play();
    }
    
    // Ocultar overlay de pausa
    ocultarPausaJuego();
  }
}

/**
 * Mostrar overlay de pausa
 */
function cambiarPausaJuego() {
  let overlay = document.getElementById('pauseOverlay');
  
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'pauseOverlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '1000';
    
    const title = document.createElement('h1');
    title.textContent = 'PAUSA';
    title.style.color = '#fff';
    title.style.fontSize = '4rem';
    title.style.margin = '0';
    title.style.fontFamily = 'monospace';
    
    const subtitle = document.createElement('p');
    subtitle.textContent = 'Presiona ESC para continuar';
    subtitle.style.color = '#aaa';
    subtitle.style.fontSize = '1.5rem';
    subtitle.style.fontFamily = 'monospace';
    
    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    document.getElementById('container').appendChild(overlay);
  } else {
    overlay.style.display = 'flex';
  }
}

/**
 * Ocultar overlay de pausa
 */
function ocultarPausaJuego() {
  const overlay = document.getElementById('pauseOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

function render()
{
	requestAnimationFrame( render );
	update();
	renderer.render( scene, camera );
}