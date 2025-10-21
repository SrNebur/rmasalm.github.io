var renderer, scene, camera, cameraMinimapa;
var cameraControls;
var angulo = -0.01;


// Objetos para generar el grafo de escena
var piso, robot, base, brazo, antebrazo, nervios, mano, pinzaIzq, pinzaDer, esfera, pilar, baseBrazo, disco;
var material, vertices;

//* Variables para la intereaccion y animacion del robot
var gui;
var reloj; // Reloj para la animacion
var keys = {}; // Array para almacenar las teclas pulsadas
var distanciaDedos = 10; // Separacion inicial entre los dedos de la pinza

var delta = 0.02; // Incremento de tiempo para la animacion
var tAnimacion = 2; // Tiempo de la animacion
var crono = 0; // Cronometro para la animacion
var animando = false; // Indica si se esta animando o no
var sentidoAnimacion = true; // Indica si la animacion va del estado inicial al final o viceversa
var ini_state = {}; // Estado inicial del robot
var end_state = {}; // Estado final del robot

// Interfaz de usuario
var controls = {
  giroBase: 0,
  giroBrazo: 0,
  giroAntebrazoY:0,
  giroAntebrazoZ:0,
  giroMano:0,
  distDedos:distanciaDedos,
  alambres: false,
  animar: animaRobot
};





// Vertices de un dedo de la pinza
vertices = new Float32Array([
  // 0 1 2 -> Mitad tapa superior
  19, 20, 0, // 0 
  19, 20, 4, // 1
  38, 15, 2, // 2
  // 2 3 0 -> Mitad tapa superior
  38, 15, 2, // 2
  38, 15, 0, // 3
  19, 20, 0, // 0
  // 1 4 2 -> Mitad cara izquierda
  19, 20, 4, // 1
  19,  0, 4, // 4
  38, 15, 2, // 2
  // 4 5 2 -> Mitad cara izquierda
  19,  0, 4, // 4
  38,  5, 2, // 5
  38, 15, 2, // 2
  // 0 3 6 -> Mitad cara derecha
  19, 20, 0, // 0
  38, 15, 0, // 3
  19,  0, 0, // 6
  // 3, 7, 6, -> Mitad cara derecha
  38, 15, 0, // 3
  38,  5, 0, // 7
  19,  0, 0, // 6
  // 4, 6, 5, -> Mitad tapa inferior
  19,  0, 4, // 4
  19,  0, 0, // 6
  38,  5, 2, // 5
  // 5, 6, 7, -> Mitad tapa inferior
  38,  5, 2, // 5
  19,  0, 0, // 6
  38,  5, 0, // 7
  // 2, 5, 3, -> Mitad tapa frontal
  38, 15, 2, // 2
  38,  5, 2, // 5
  38, 15, 0, // 3
  // 5, 7, 3, -> Mitad tapa frontal
  38,  5, 2, // 5
  38,  5, 0, // 7
  38, 15, 0, // 3
]);


init();
render();

//********************************************************************
//* Funcion de inicializacion de la escena
//********************************************************************

function init()
{
  renderer = new THREE.WebGLRenderer();
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.setClearColor( new THREE.Color(0xFFFFFF) );
  document.getElementById('container').appendChild( renderer.domElement );

  scene = new THREE.Scene();
  //Material de relleno y alambre
  materialRellenado = new THREE.MeshNormalMaterial();
  materialWired = new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true});

  // Por defecto el material sera el de relleno (cambiar en caso de querer otro)
  material = materialRellenado;

  loadScene();

  //Camara principal orbital
  var aspectRatio = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera( 50, aspectRatio , 1, 1000 );
  camera.position.set( 300, 400, 300 );

  cameraControls = new THREE.OrbitControls( camera, renderer.domElement );
  cameraControls.target.set( 0, 0, 0 );

  //Camara minimapa cenital
  cameraMinimapa = new THREE.OrthographicCamera( -50, 50, 50,-50, 1, 1000 );
  cameraMinimapa.position.set(0,500,0);
  cameraMinimapa.lookAt( 0, 0, 0 );
  cameraMinimapa.up.set( 0, 0, 1 );
  cameraMinimapa.rotateOnAxis(new THREE.Vector3(0,0,1), -Math.PI / 2);
  cameraMinimapa.updateProjectionMatrix();

  window.addEventListener('resize', updateAspectRatio );

  //* Eventos de teclado
  //Pulsacion de una tecla
  window.addEventListener('keydown', (event) => {
    keys[event.key] = true;
  });
  //Soltar una tecla
  window.addEventListener('keyup', (event) => {
    keys[event.key] = false;
  });

  reloj = new THREE.Clock();

  //* Interfaz de usuario
  gui = new dat.GUI().addFolder('Control Robot');
  gui.add(controls, 'giroBase', -180, 180).name("Giro Base");
  gui.add(controls, 'giroBrazo', -45, 45).name("Giro Brazo");
  gui.add(controls, 'giroAntebrazoY', -180, 180).name("Giro Antebrazo Y");
  gui.add(controls, 'giroAntebrazoZ', -90, 90).name("Giro Antebrazo Z");
  gui.add(controls, 'giroMano', -40, 220).name("Giro Pinza");
  gui.add(controls, 'distDedos', 0, 15).name("Separacion Pinza");
  gui.add(controls, 'alambres').name("Alambres");
  gui.add(controls, 'animar').name("Animar");
  gui.open();

}



//********************************************************************
//* Funciones de creacion de los objetos de la escena
//********************************************************************

function loadSuelo()
{  
  //Geometria y material del suelo
  let geometriaPiso = new THREE.PlaneGeometry(1000, 1000, 100, 100);
  piso = new THREE.Mesh(geometriaPiso,material);
  //Rotacion para ponerlo horizontal
  piso.rotateOnAxis(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  scene.add(piso);
}

//* Base del robot
function loadBase()
{
  // Geometria de la base
  let geometriaCilindro = new THREE.CylinderGeometry( 50, 50, 15, 32 ); 
  base = new THREE.Mesh( geometriaCilindro, material );
  // Poner la base en el origen de coordenadas
  base.position.set(0,15/2,0); // Ponerlo en el (0,0,0)
}

//* Brazo del robot
function loadBrazo()
{
  //Objeto que contiene el brazo completo
  brazo = new THREE.Object3D();
  // Geometria de la base del brazo
  baseBrazo = new THREE.CylinderGeometry( 20, 20, 18, 32 ); 
  baseBrazo = new THREE.Mesh( baseBrazo, material );
  // Rotacion para ponerlo vertical
  baseBrazo.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  // Posicionarlo encima de la base
  baseBrazo.position.set(0,20,0);
  brazo.add(baseBrazo);

  // Geometria del pilar
  pilar =  new THREE.BoxGeometry( 18, 120, 12 );
  pilar = new THREE.Mesh(pilar, material);
  // Posicion por encima de la base del brazo -> 120/2(brazo) + 40/2(base brazo) = 80
  pilar.position.set(0,80,0);
  brazo.add(pilar);

  //Geometria de la esfera superior del brazo
  esfera = new THREE.SphereGeometry(20,32, 16);
  esfera = new THREE.Mesh(esfera, material)
  // Posicion por encima del pilar -> 120(pilar) + 20(esfera) = 140
  esfera.position.set(0,140,0);
  brazo.add(esfera);
}


function loadAntebrazo()
{
  antebrazo = new THREE.Object3D();

  // Geometria del disco
  let geometriaDisco = new THREE.CylinderGeometry(22, 22, 6, 32);
  disco = new THREE.Mesh(geometriaDisco, material);  
  antebrazo.add(disco);
  // Cilindros del antebrazo
  let distancia = 10; // Distancia al centro del antebrazo
  // Crear los 4 cilindros del antebrazo
  //Doble bucle para las 4 posiciones -> (x,z) = (+,+), (+,-), (-,+), (-,-)
  for(let i = -1; i < 2; i +=2){
    for (let j = -1; j < 2; j+=2){
      //Geometria del cilindro
      let geometriaCilindro = new THREE.BoxGeometry(4,80,4);
      let cilindro = new THREE.Mesh(geometriaCilindro,material);
      // Posicionarlo en los 4 puntos a la distancia, altura -> 80/2(cilindro) = 40
      cilindro.position.set(distancia * i, 40, distancia * j);
      antebrazo.add(cilindro);
    }
  }
  // Ajustamos la altura del grupo para cuadrarlo con los otros elementos 120(pilar) + 20(esfera) = 140
  antebrazo.position.y = 140;
}

function crearDedo()
{
  // Objeto que contiene el dedo
  let dedo = new THREE.Object3D();
  // Geometria del agarre de la pinza a la mano
  let geometriaPinza = new THREE.BoxGeometry(19,20,4);
  let pinza = new THREE.Mesh(geometriaPinza, material);
  //Posicion de la pinza en la mano 
  pinza.position.set(19/2,10,2);
  dedo.add(pinza);

  // Geometria del dedo
  var geometry = new THREE.BufferGeometry();
  // Asignacion de los vertices al buffer, el cual se encarga de recorrer todos los vertices de 3 en 3 e ir creando los triangulos
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  // Calculo de normales de los vertices
  geometry.computeVertexNormals();

  dedo.add(new THREE.Mesh(geometry, material));
  return dedo;
}

function loadMano()
{

  // Objeto que contiene la mano
  mano = new THREE.Object3D();
  // Cilindro de la mano
  let cilindroMano = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 40, 32), material);
  //Rotacion para ponerlo horizontal
  cilindroMano.rotateOnAxis(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  mano.add(cilindroMano);

  // Generamos los dos dedos
  pinzaIzq = crearDedo();
  pinzaDer = crearDedo();

  
  // Rotacion del dedo derecho para que mire hacia el otro
  pinzaDer.rotateOnAxis(new THREE.Vector3(1, 0, 0), Math.PI);

  //Posicion de la pinza en la mano
  pinzaIzq.position.set(0,-10,0); //20(altura pinza)/2
  pinzaDer.position.set(0,10,0); //20(altura pinza)/2. Como esta rotado hay que subir en vez de bajar
  
  //Separamos cada dedo la mitad de la distancia entre ellos
  pinzaDer.position.z = -distanciaDedos / 2;
  pinzaIzq.position.z = +distanciaDedos / 2;

  mano.add(pinzaIzq);
  mano.add(pinzaDer);

  //Posicion de la mano en el antebrazo -> 80(altura antebrazo)
  mano.position.y = 80;
}

function loadScene()
{
  // Añadir el suelo a la escena
  loadSuelo();

  robot = new THREE.Object3D();
  
  // Cilindro de base
  loadBase();
  
  // Brazo robot
  loadBrazo();

  // Antebrazo del robot
  loadAntebrazo();

  // Mano del robot
  loadMano();

  // Grafo de escena
  antebrazo.add(mano);
  brazo.add(antebrazo);
  base.add(brazo);
  robot.add(base);

  // Poner el robot en la escena
  scene.add(robot);
  
}

function updateAspectRatio() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // Actualizar aspecto de la camara del minimapa
  cameraMinimapa.aspect = window.innerWidth / window.innerHeight;
  cameraMinimapa.updateProjectionMatrix();
} 


function update()
{
  cameraControls.update();
  //* Actualizacion de los valores del robot segun la interfaz
  base.rotation.y       = controls.giroBase * Math.PI / 180;
  brazo.rotation.z      = controls.giroBrazo * Math.PI / 180;
  antebrazo.rotation.y  = controls.giroAntebrazoY * Math.PI / 180;
  antebrazo.rotation.z  = controls.giroAntebrazoZ * Math.PI / 180;
  mano.rotation.z       = controls.giroMano * Math.PI / 180;

  pinzaIzq.position.z = +controls.distDedos / 2;
  pinzaDer.position.z = -controls.distDedos / 2;

  robot.traverse(function(node) {
    node.material = controls.alambres ? materialWired : materialRellenado;
  });
  piso.material = controls.alambres ? materialWired : materialRellenado;

  //* Movimiento del robot con las teclas W, A, S, D
  if (keys['w']) robot.position.x -= velocidad;
  if (keys['s']) robot.position.x += velocidad;
  if (keys['a']) robot.position.z += velocidad;
  if (keys['d']) robot.position.z -= velocidad;

  animar(reloj.getDelta()); 

}

//* Funcion para devolver un numero aleatorio entre min y max
function intRandom(lo, hi) {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function animaRobot(){
  //Si ya esta animando, no hacer nada
  if(animando){
    return;    
  }
  // Indicamos que se va a animar
  animando = !animando;
  // Guardar las condiciones iniciales
  ini_state = {
    giroBase: controls.giroBase,
    giroBrazo: controls.giroBrazo,
    giroAntebrazoY: controls.giroAntebrazoY,
    giroAntebrazoZ: controls.giroAntebrazoZ,
    giroMano: controls.giroMano,
    distDedos: controls.distDedos
  }
  //Ponemos el estado final de forma aleatoria
  end_state = {
    giroBase:  intRandom(-180,180),
    giroBrazo: intRandom(-45,45),
    giroAntebrazoY:intRandom(-180,180),
    giroAntebrazoZ:intRandom(-90,90),
    giroMano: intRandom(-40,220),
    distDedos: intRandom(0,15)
  }
}

//* Función de interpolacion lineal
function interpolacionLineal(inicial, final, time){
  return (1 - time)*inicial + final * time;
}


function animar(){
  if (animando) {
    crono += delta; // Actualizamos el crono
    let rel = crono  / tAnimacion; // Valor entre 0 y 1 que indica el tiempo relativo de la animacion
    // Actualizamos todos los valores del robot segun el tiempo relativo
    if(sentidoAnimacion){
      controls.giroBase        = interpolacionLineal(ini_state.giroBase, end_state.giroBase, rel);
      controls.giroBrazo       = interpolacionLineal(ini_state.giroBrazo, end_state.giroBrazo, rel);
      controls.giroAntebrazoY = interpolacionLineal(ini_state.giroAntebrazoY, end_state.giroAntebrazoY, rel);
      controls.giroAntebrazoZ = interpolacionLineal(ini_state.giroAntebrazoZ, end_state.giroAntebrazoZ, rel);
      controls.giroMano       = interpolacionLineal(ini_state.giroMano, end_state.giroMano, rel);
      controls.distDedos        = interpolacionLineal(ini_state.distDedos, end_state.distDedos, rel);
    } else {
      controls.giroBase        = interpolacionLineal(end_state.giroBase, ini_state.giroBase, rel);
      controls.giroBrazo       = interpolacionLineal(end_state.giroBrazo, ini_state.giroBrazo, rel);
      controls.giroAntebrazoY = interpolacionLineal(end_state.giroAntebrazoY, ini_state.giroAntebrazoY, rel);
      controls.giroAntebrazoZ = interpolacionLineal(end_state.giroAntebrazoZ, ini_state.giroAntebrazoZ, rel);
      controls.giroMano       = interpolacionLineal(end_state.giroMano, ini_state.giroMano, rel);
      controls.distDedos        = interpolacionLineal(end_state.distDedos, ini_state.distDedos, rel);
    }
    // Si se ha acabado la animacion, cambiar el sentido y reiniciar el crono
    if(crono >= tAnimacion){
      sentidoAnimacion = !sentidoAnimacion;
      crono = 0;
      // Si ya hemos vuelto al estado inicial, parar la animacion
      if(sentidoAnimacion && animando){
        animando = false;
        return;
      }
    }
    // Actualizar los valores de la interfaz
    gui.updateDisplay();
  }
}


function render()
{
	requestAnimationFrame( render );
	update();


	// Vista camara principal
  renderer.autoClear = false;
  // Ponemos el viewport a toda la pantalla
  renderer.setViewport(0,0,window.innerWidth,window.innerHeight);
  //Establecemos el color de fondo
  renderer.setClearColor( new THREE.Color(0xFFFFFF) );
  // Limpiamos el framebuffer
  renderer.clear();
  // Renderizamos la escena con la camara principal
  renderer.render( scene, camera );

  // Vista camara minimapa
  // Calculamos el tamaño del minimapa (un cuarto del menor lado de la ventana)
  var ds = Math.min(window.innerHeight, window.innerWidth) / 4;
  // Ponemos el viewport en la esquina superior izquierda
  renderer.setViewport(0, window.innerHeight - ds, ds, ds);
  // Configuramos el scissor para que solo se dibuje en esa zona
  renderer.setScissor(0, window.innerHeight - ds, ds, ds);
  // Activamos el scissor test para que se aplique la restriccion a esa zona
  renderer.setScissorTest(true);
  // Establecemos el color de fondo del minimapa
  renderer.setClearColor(new THREE.Color(0xFFFFFF));
  renderer.clear();
  // Renderizamos la escena con la camara del minimapa
  renderer.render(scene, cameraMinimapa);
  // Desactivamos scissor test despues del renderizado
  renderer.setScissorTest(false); 
}

