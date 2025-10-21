/*
 * Clase para generar diferentes tipos de terrenos con relieve
 * Utiliza ruido Perlin para crear elevaciones naturales
 */
class GeneradorTerreno {
    constructor(tamanyo = 400, segmentos = 200) {
        this.tamanyo = tamanyo;
        this.segmentos = segmentos;
        // Cargar textura del suelo una sola vez por generador
        const loader = new THREE.TextureLoader();
        this.groundTexture = loader.load('images/suelo.jpg');
        this.groundTexture.wrapS = THREE.RepeatWrapping;
        this.groundTexture.wrapT = THREE.RepeatWrapping;
        // Repetición basada en tamaño del terreno para evitar texels gigantes o minúsculos
        const repeatCount = Math.max(8, Math.floor(this.tamanyo / 20));
        this.groundTexture.repeat.set(repeatCount, repeatCount);
        this.groundTexture.anisotropy = 4;
    }

    // Función simple de ruido pseudo-aleatorio basada en coordenadas
    noise(x, y) {
        let n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return (n - Math.floor(n)) * 2 - 1; // Normalizar a [-1, 1]
    }


    /** Función de ruido suavizado que hace un promedio ponderado de los valores vecinos, evitando cambios bruscos
     * [x-1,y-1] [x,y-1] [x+1,y-1]    <- Esquinas y lados <- 1/16 | 1/8 | 1/16
     * [x-1,y  ] [x,y  ] [x+1,y  ]    <- Centro <- 1/8 | 1/4 | 1/8
     * [x-1,y+1] [x,y+1] [x+1,y+1]    <- Esquinas y lados <- 1/16 | 1/8 | 1/16
     */
    smoothNoise(x, y) {
        let esquinas = (this.noise(x-1, y-1) + this.noise(x+1, y-1) + this.noise(x-1, y+1) + this.noise(x+1, y+1)) / 16;
        let lados = (this.noise(x-1, y) + this.noise(x+1, y) + this.noise(x, y-1) + this.noise(x, y+1)) / 8;
        let centro = this.noise(x, y) / 4;
        return esquinas + lados + centro;
    }

    // Función de ruido interpolado
    interpolatedNoise(x, y) {
        let integerX = Math.floor(x);
        let fractionalX = x - integerX;
        let integerY = Math.floor(y);
        let fractionalY = y - integerY;

        let v1 = this.smoothNoise(integerX, integerY);
        let v2 = this.smoothNoise(integerX + 1, integerY);
        let v3 = this.smoothNoise(integerX, integerY + 1);
        let v4 = this.smoothNoise(integerX + 1, integerY + 1);

        let i1 = this.interpolate(v1, v2, fractionalX);
        let i2 = this.interpolate(v3, v4, fractionalX);

        return this.interpolate(i1, i2, fractionalY);
    }

    // Función de interpolación coseno
    interpolate(a, b, x) {
        let ft = x * Math.PI;
        let f = (1 - Math.cos(ft)) * 0.5;
        return a * (1 - f) + b * f;
    }

    // Función de ruido Perlin simplificado
    perlinNoise(x, y, octaves = 4, persistence = 0.5, frequency = 0.02) {
        let total = 0;
        let amplitude = 1;
        let maxValue = 0;

        for (let i = 0; i < octaves; i++) {
            total += this.interpolatedNoise(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }

        return total / maxValue;
    }


    generarTerrenoBasico(opciones = {}) {
        const config = {
            alturaBase: 15,
            alturaMontanas: 25,
            alturaDetalles: 3,
            color: 0x8B7355,
            wireframe: false,
            ...opciones
        };

        const geometry = new THREE.PlaneGeometry(this.tamanyo, this.tamanyo, this.segmentos, this.segmentos);
        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);

            let altura = 0;

            // Capa base: ondulaciones suaves
            altura += this.perlinNoise(vertex.x, vertex.y) * config.alturaBase;

            // Capa de montañas: características más grandes
            altura += this.perlinNoise(vertex.x * 0.3, vertex.y * 0.3) * config.alturaMontanas;

            // Capa de detalles: pequeñas variaciones
            altura += this.perlinNoise(vertex.x * 2, vertex.y * 2) * config.alturaDetalles;

            positions.setZ(i, altura);
        }

    geometry.computeVertexNormals();
    // Asegura volumen de colisión correcto para raycasting
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            wireframe: config.wireframe,
            side: THREE.DoubleSide
        });

    const terreno = new THREE.Mesh(geometry, material);
    terreno.castShadow = false;
    terreno.receiveShadow = true;
        
        // Árboles: ahora preferimos colocarlos vía raycast desde main.js tras añadir a escena
        
        terreno.rotation.x = -Math.PI / 2; // Rotar para que sea horizontal

        return terreno;
    }

    generarTerrenoMontanoso(opciones = {}) {
        const config = {
            radioMontanas: 150,
            alturaMontanas: 30,
            alturaRuido: 20,
            alturaOndulaciones: 15,
            color: 0x654321,
            wireframe: false,
            ...opciones
        };

        const geometry = new THREE.PlaneGeometry(this.tamanyo, this.tamanyo, this.segmentos, this.segmentos);
        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);

            let altura = 0;
            let distanciaDelCentro = Math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y);

            // Montañas centrales
            if (distanciaDelCentro < config.radioMontanas) {
                altura += Math.cos(distanciaDelCentro * 0.02) * config.alturaMontanas;
            }

            // Añadir ruido para naturalidad
            altura += this.perlinNoise(vertex.x, vertex.y) * config.alturaRuido;
            altura += Math.sin(vertex.x * 0.01) * Math.cos(vertex.y * 0.01) * config.alturaOndulaciones;

            positions.setZ(i, altura);
        }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            wireframe: config.wireframe
        });

    const terreno = new THREE.Mesh(geometry, material);
    terreno.castShadow = false;
    terreno.receiveShadow = true;
        terreno.rotation.x = -Math.PI / 2;

        return terreno;
    }

    generarTerrenoColinas(opciones = {}) {
        const config = {
            alturaColinas1: 10,
            alturaColinas2: 8,
            alturaOndulaciones: 15,
            alturaRuido: 5,
            color: 0x90EE90,
            wireframe: false,
            ...opciones
        };

        const geometry = new THREE.PlaneGeometry(this.tamanyo, this.tamanyo, this.segmentos, this.segmentos);
        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);

            let altura = 0;

            // Crear ondulaciones suaves tipo colinas
            altura += Math.sin(vertex.x * 0.02) * config.alturaColinas1;
            altura += Math.cos(vertex.y * 0.015) * config.alturaColinas2;
            altura += Math.sin(vertex.x * 0.005 + vertex.y * 0.005) * config.alturaOndulaciones;

            // Añadir variaciones aleatorias
            altura += this.perlinNoise(vertex.x, vertex.y) * config.alturaRuido;

            positions.setZ(i, altura);
        }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            wireframe: config.wireframe
        });

    const terreno = new THREE.Mesh(geometry, material);
    terreno.castShadow = false;
    terreno.receiveShadow = true;
        terreno.rotation.x = -Math.PI / 2;

        return terreno;
    }

    generarTerrenoDesierto(opciones = {}) {
        const config = {
            alturaDunas: 20,
            alturaOndasGrandes: 12,
            alturaOndasPequenas: 4,
            color: 0xF4A460, // Sandy Brown
            wireframe: false,
            ...opciones
        };

        const geometry = new THREE.PlaneGeometry(this.tamanyo, this.tamanyo, this.segmentos, this.segmentos);
        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);

            let altura = 0;

            // Dunas grandes y suaves
            altura += this.perlinNoise(vertex.x * 0.5, vertex.y * 0.5, 3, 0.6, 0.01) * config.alturaDunas;

            // Ondulaciones medianas
            altura += this.perlinNoise(vertex.x, vertex.y, 2, 0.4, 0.03) * config.alturaOndasGrandes;

            // Textura de arena fina
            altura += this.perlinNoise(vertex.x * 3, vertex.y * 3, 2, 0.3, 0.05) * config.alturaOndasPequenas;

            positions.setZ(i, altura);
        }

    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            wireframe: config.wireframe
        });

    const terreno = new THREE.Mesh(geometry, material);
    terreno.castShadow = false;
    terreno.receiveShadow = true;
        terreno.rotation.x = -Math.PI / 2;

        return terreno;
    }

    generarTerrenoVolcanico(opciones = {}) {
        const config = {
            radioCrater: 80,
            profundidadCrater: -25,
            alturaVolcan: 40,
            alturaRuido: 15,
            color: 0x8B0000, // Dark Red
            wireframe: false,
            ...opciones
        };

        const geometry = new THREE.PlaneGeometry(this.tamanyo, this.tamanyo, this.segmentos, this.segmentos);
        const positions = geometry.attributes.position;
        const vertex = new THREE.Vector3();

        for (let i = 0; i < positions.count; i++) {
            vertex.fromBufferAttribute(positions, i);

            let altura = 0;
            let distanciaDelCentro = Math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y);

            // Crear el volcán con cráter
            if (distanciaDelCentro < config.radioCrater) {
                // Cráter en el centro
                altura += config.profundidadCrater * (1 - distanciaDelCentro / config.radioCrater);
            } else if (distanciaDelCentro < config.radioCrater * 2) {
                // Ladera del volcán
                let factor = (distanciaDelCentro - config.radioCrater) / config.radioCrater;
                altura += config.alturaVolcan * (1 - factor);
            }

            // Añadir rugosidad volcánica
            altura += this.perlinNoise(vertex.x, vertex.y, 6, 0.7, 0.02) * config.alturaRuido;

            positions.setZ(i, altura);
        }

        geometry.computeVertexNormals();
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();

        const material = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
            wireframe: config.wireframe
        });

    const terreno = new THREE.Mesh(geometry, material);
    terreno.castShadow = false;
    terreno.receiveShadow = true;
        terreno.rotation.x = -Math.PI / 2;

        return terreno;
    }
    
    /**
     * Calcula la altura del terreno en una posición (x, z) del mundo
     * @param {number} x - Coordenada X del mundo
     * @param {number} z - Coordenada Z del mundo
     * @returns {number} Altura Y del terreno en esa posición
     */
    calcularAltura(x, z) {
        // El terreno está rotado -90° en X, así que:
        // - X del mundo = X del plano original
        // - Z del mundo = Y del plano original (antes de rotar)
        // Entonces usamos (x, z) directamente en las funciones de ruido
        let altura = 0;
        altura += this.perlinNoise(x, z) * 15;
        altura += this.perlinNoise(x * 0.3, z * 0.3) * 25;
        altura += this.perlinNoise(x * 2, z * 2) * 3;
        return altura;
    }

    static distribuirArbolesLowPolyRaycast(scene, terrainMesh, count, tamanyo, arbolesArray) {
        if (!terrainMesh) return;
        const raycaster = new THREE.Raycaster();
        // Asegurar que las matrices están actualizadas para el raycast
        terrainMesh.updateMatrixWorld(true);
        let creados = 0;
        let intentos = 0;
        let misses = 0;
        const maxIntentos = Math.max(count * 10, 200);
        
        console.log(`[Arboles] Solicitados=${count}, tamanyoTerreno=${tamanyo}`);
        
        while (creados < count && intentos < maxIntentos) {
            intentos++;
            let wx, wz, dist;
            // Elegimos coordenadas en XZ mundo (porque el terreno ya está rotado)
            do {
                wx = (Math.random() - 0.5) * tamanyo * 0.9;
                wz = (Math.random() - 0.5) * tamanyo * 0.9;
                dist = Math.sqrt(wx*wx + wz*wz);
            } while (dist < 15);

            const origin = new THREE.Vector3(wx, 9999, wz);
            raycaster.set(origin, new THREE.Vector3(0, -1, 0));
            const hit = raycaster.intersectObject(terrainMesh, false);
            let p;
            if (!hit || hit.length === 0) {
                // Fallback por geometría si el raycast falla
                const sampleY = GeneradorTerreno.alturaDesdeGeometria(terrainMesh, wx, wz);
                if (sampleY === null) { misses++; continue; }
                p = new THREE.Vector3(wx, sampleY, wz);
            } else {
                p = hit[0].point; // Punto en mundo
            }

            // Grupo árbol
            const tree = new THREE.Group();
            const escala = 1.2 + Math.random() * 1.2;
            const alturaTronco = 3 * escala;
            const radioTronco = 0.3 * escala;
            // Hitbox ajustada: colisiona solo con el tronco (no con la copa), con un pequeño margen
            // Evitamos un mínimo fijo grande; ligamos el mínimo a la escala del árbol
            const radioColision = Math.max(radioTronco, 0.35 * escala);

            // Tronco
            const troncoGeom = new THREE.CylinderGeometry(radioTronco, radioTronco * 1.2, alturaTronco, 6);
            const troncoMat = new THREE.MeshStandardMaterial({ color: 0x4a2511, flatShading: true });
            const tronco = new THREE.Mesh(troncoGeom, troncoMat);
            tronco.castShadow = true;
            tronco.receiveShadow = true;
            tronco.position.set(0, alturaTronco/2, 0);
            tree.add(tronco);

            // Copas (3 conos)
            const colores = [0x2d5016, 0x3a6b1f, 0x4a8527];
            const alturas = [2.2*escala, 2.0*escala, 1.8*escala];
            const radios = [1.8*escala, 1.5*escala, 1.2*escala];
            const offsets = [0, 1.3*escala, 2.4*escala];
            for (let j = 0; j < 3; j++) {
                const g = new THREE.ConeGeometry(radios[j], alturas[j], 6);
                const m = new THREE.MeshStandardMaterial({ color: colores[j], flatShading: true });
                const cono = new THREE.Mesh(g, m);
                cono.castShadow = true;
                cono.receiveShadow = true;
                cono.position.set(0, alturaTronco + offsets[j] + alturas[j]/2, 0);
                tree.add(cono);
            }

            // Convertir posición de impacto a coordenadas locales del terreno y colocar el grupo
            const localPos = terrainMesh.worldToLocal(p.clone());
            tree.position.copy(localPos);
            // Compensar la rotación del terreno (-PI/2 en X) para que el árbol quede vertical en mundo
            tree.rotation.x = Math.PI / 2;
            // Variación aleatoria de giro alrededor del eje vertical
            tree.rotation.y = Math.random() * Math.PI * 2;

            // Añadir como hijo del terreno para que comparta transformaciones
            terrainMesh.add(tree);
            
            // Guardar posición en mundo para colisión
            if (arbolesArray) {
                arbolesArray.push({ x: p.x, z: p.z, radio: radioColision });
            }
            
            creados++;
        }
        console.log(`[Arboles] Creados=${creados}/${count}, intentos=${intentos}, fallosRaycast=${misses}`);
    }

    /**
     * Altura por muestreo directo de geometría (bilineal) en (wx, wz)
     */
    static alturaDesdeGeometria(terrainMesh, wx, wz) {
        const geom = terrainMesh.geometry;
        if (!geom || !geom.attributes || !geom.attributes.position) return null;
        // Asegura parámetros del plano
        const params = geom.parameters;
        if (!params) return null;
        const width = params.width, height = params.height;
        const segW = params.widthSegments;
        const segH = params.heightSegments;
        if (width === undefined || height === undefined || !segW || !segH) return null;

        // Convertir a coordenadas locales del plano rotado: world -> local
        const local = terrainMesh.worldToLocal(new THREE.Vector3(wx, 0, wz));
        const minX = -width/2, maxX = width/2;
        const minY = -height/2, maxY = height/2; // eje Y local del plano (antes de rotar)
        if (local.x < minX || local.x > maxX || local.y < minY || local.y > maxY) return null;

        const u = (local.x - minX) / (maxX - minX);
        const v = (local.y - minY) / (maxY - minY);
        const xIdx = u * segW;
        const yIdx = v * segH;
        const i = Math.floor(xIdx);
        const j = Math.floor(yIdx);
        const du = xIdx - i;
        const dv = yIdx - j;

        const stride = segW + 1;
        const pos = geom.attributes.position;
        const idx00 = j * stride + i;
        const idx10 = j * stride + (i + 1);
        const idx01 = (j + 1) * stride + i;
        const idx11 = (j + 1) * stride + (i + 1);
        if (idx11 >= pos.count) return null;
        const z00 = pos.getZ(idx00);
        const z10 = pos.getZ(idx10);
        const z01 = pos.getZ(idx01);
        const z11 = pos.getZ(idx11);
        const z0 = z00 * (1 - du) + z10 * du;
        const z1 = z01 * (1 - du) + z11 * du;
        const z = z0 * (1 - dv) + z1 * dv;

        // Convertir a Y mundo
        const world = terrainMesh.localToWorld(new THREE.Vector3(local.x, local.y, z));
        return world.y;
    }
    distribuirArbolesLowPoly = function(terrainMesh, generador, count, tamanyo) {
    let arbolesCreados = 0;
    
    console.log(`Intentando crear ${count} árboles en terreno de tamaño ${tamanyo}`);
    
    for (let i = 0; i < count; i++) {
            // Posición aleatoria en el PLANO (x, y) evitando el centro
            let planeX, planeY, dist;
        do {
                planeX = (Math.random() - 0.5) * tamanyo * 0.85;
                planeY = (Math.random() - 0.5) * tamanyo * 0.85;
                dist = Math.sqrt(planeX*planeX + planeY*planeY);
        } while (dist < 30);
        
            // Calcular altura del terreno EXACTAMENTE como se hace en generarTerrenoBasico
            let altura = 0;
            altura += generador.perlinNoise(planeX, planeY) * 15;  // alturaBase
            altura += generador.perlinNoise(planeX * 0.3, planeY * 0.3) * 25;  // alturaMontanas
            altura += generador.perlinNoise(planeX * 2, planeY * 2) * 3;  // alturaDetalles
        
        // Variación de tamaño
        const escala = 2.0 + Math.random() * 1.5;
        const alturaTronco = 3 * escala;
        const radioTronco = 0.3 * escala;
        
        // Crear tronco (cilindro) - rotado 90° para que apunte en Z (que será Y después)
        const troncoGeom = new THREE.CylinderGeometry(radioTronco, radioTronco * 1.2, alturaTronco, 6);
        const troncoMat = new THREE.MeshStandardMaterial({ 
            color: 0x4a2511,
            flatShading: true 
        });
        const tronco = new THREE.Mesh(troncoGeom, troncoMat);
        tronco.rotation.x = Math.PI / 2; // Rotar para que apunte en Z
            // Posición en el plano: (planeX, planeY, altura + offset)
            tronco.position.set(planeX, planeY, altura + alturaTronco/2);
        tronco.castShadow = true;
        tronco.receiveShadow = true;
        terrainMesh.add(tronco);
        
        // Crear 3 conos apilados para la copa
        const coloresCopa = [0x2d5016, 0x3a6b1f, 0x4a8527];
        const alturasCono = [2.2 * escala, 2.0 * escala, 1.8 * escala];
        const radiosCono = [1.8 * escala, 1.5 * escala, 1.2 * escala];
            const offsetsZ = [0, 1.3 * escala, 2.4 * escala];
        
        for (let j = 0; j < 3; j++) {
            const conoGeom = new THREE.ConeGeometry(radiosCono[j], alturasCono[j], 6);
            const conoMat = new THREE.MeshStandardMaterial({ 
                color: coloresCopa[j],
                flatShading: true 
            });
            const cono = new THREE.Mesh(conoGeom, conoMat);
            cono.rotation.x = Math.PI / 2; // Rotar para que apunte en Z
            cono.position.set(
                    planeX, 
                    planeY, 
                    altura + alturaTronco + offsetsZ[j] + alturasCono[j]/2
            );
            cono.castShadow = true;
            cono.receiveShadow = true;
            terrainMesh.add(cono);
        }
        
        arbolesCreados++;
    }
    
    console.log(`Árboles creados: ${arbolesCreados}/${count}`);
};
}


