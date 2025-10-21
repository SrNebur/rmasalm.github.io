var renderer, scene, camera;
var cameraControls;
var angulo = -0.01;


// Objetos para generar el grafo de escena
var robot, base, brazo, antebrazo, nervios, mano, pinzaIzq, pinzaDer, esfera, pilar, baseBrazo, disco;
var material, vertices;
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

  materialRellenado = new THREE.MeshNormalMaterial();
  materialWired = new THREE.MeshBasicMaterial({color:0xff0000, wireframe:true});

  material = materialRellenado;

  loadScene();

  var aspectRatio = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera( 50, aspectRatio , 1, 1000 );
  camera.position.set( 300, 400, 300 );

  cameraControls = new THREE.OrbitControls( camera, renderer.domElement );
  cameraControls.target.set( 0, 0, 0 );

  window.addEventListener('resize', updateAspectRatio );

}

//********************************************************************
//* Funciones de creacion de los objetos de la escena
//********************************************************************

function loadSuelo()
{  
  //Geometria y material del suelo
  let geometriaPiso = new THREE.PlaneGeometry(1000, 1000, 100, 100);
  let piso = new THREE.Mesh(geometriaPiso,material);
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
  var geometry = new THREE.BufferGeometry();
  
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));

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

  // Posicion de los dedos en la mano
  let distanciaDedos = 10;
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

  loadMano();

  // Grafo de escena
  antebrazo.add(mano);
  brazo.add(antebrazo);
  base.add(brazo);
  robot.add(base);
  scene.add(robot);
  
}

function updateAspectRatio() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
} 





function update()
{
  cameraControls.update();
}


function render()
{
	requestAnimationFrame( render );
	update();
	renderer.render( scene, camera );
}

