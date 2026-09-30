import * as THREE from 'three';
import { buildWeaponModel } from './voxel.js';

// Renders each weapon's voxel model once into a small image for the toolbar.
const W = 224, H = 100;
const cache = new Map();
let renderer, scene, camera;

function init() {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x554433, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 3, 4);
  scene.add(sun);
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  camera.position.set(0, 0, 10);
}

export function weaponIcon(key, def) {
  if (cache.has(key)) return cache.get(key);
  if (!renderer) init();
  const holder = new THREE.Group();
  const { group } = buildWeaponModel(def);
  // Side-on view with the barrel pointing right, slightly tilted toward the camera.
  group.rotation.set(0, -Math.PI / 2, 0);
  holder.add(group);
  holder.rotation.set(0.35, 0.3, 0.12);
  scene.add(holder);
  holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  holder.position.sub(center);
  const aspect = W / H;
  const halfH = Math.max(size.y, size.x / aspect) * 0.58;
  camera.left = -halfH * aspect;
  camera.right = halfH * aspect;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(holder);
  holder.traverse((o) => o.material && o.material.dispose());
  cache.set(key, url);
  return url;
}
