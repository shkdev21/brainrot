import * as THREE from 'three';

const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x556644, 0.9));
const sun = new THREE.DirectionalLight(0xfff2cc, 1.2);
sun.position.set(40, 60, 20);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(70, 48).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: 0x77bb55 }),
);
scene.add(ground);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
