import { getAircraft } from "./aircrafts.js";

const THREE_MODULE = "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.min.js";

const degToRad = (degrees) => (degrees * Math.PI) / 180;

function wingGeometry(THREE, side, span, rootChord, tipChord, sweep, thickness = 0.1) {
  const direction = side === "left" ? -1 : 1;
  const rootX = direction * 0.18;
  const tipX = direction * span;
  const top = thickness / 2;
  const points = [
    [rootX, top, -rootChord / 2],
    [tipX, top, sweep - tipChord / 2],
    [tipX, top, sweep + tipChord / 2],
    [rootX, top, rootChord / 2],
    [rootX, -top, -rootChord / 2],
    [tipX, -top, sweep - tipChord / 2],
    [tipX, -top, sweep + tipChord / 2],
    [rootX, -top, rootChord / 2],
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function addWingPair(THREE, group, material, options) {
  ["left", "right"].forEach((side) => {
    const wing = new THREE.Mesh(
      wingGeometry(
        THREE,
        side,
        options.span,
        options.rootChord,
        options.tipChord,
        options.sweep,
        options.thickness,
      ),
      material,
    );
    wing.position.set(0, options.y ?? 0, options.z ?? 0);
    group.add(wing);
  });
}

function fuselageGeometry(THREE, length, width, segments = 32) {
  const half = length / 2;
  const profile = [
    [0.03, -half],
    [width * 0.34, -half + length * 0.04],
    [width * 0.5, -half + length * 0.18],
    [width * 0.52, 0],
    [width * 0.38, half * 0.7],
    [width * 0.13, half * 0.96],
    [0.03, half],
  ].map(([radius, z]) => new THREE.Vector2(radius, z));
  const geometry = new THREE.LatheGeometry(profile, segments);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

function addWindowRow(THREE, group, glass, count, spacing, y, startZ, width = 0.16) {
  for (let index = 0; index < count; index += 1) {
    const z = startZ + index * spacing;
    [-1, 1].forEach((side) => {
      const window = new THREE.Mesh(new THREE.SphereGeometry(width, 12, 8), glass);
      window.scale.set(0.28, 0.8, 1);
      window.position.set(side * 0.51, y, z);
      group.add(window);
    });
  }
}

function addWheel(THREE, gear, materials, x, y, z, radius, strutTopY) {
  const strutHeight = Math.max(0.15, strutTopY - y);
  const strut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.032, strutHeight, 10),
    materials.metal,
  );
  strut.position.set(x, y + strutHeight / 2, z);
  strut.rotation.z = x === 0 ? 0 : (x > 0 ? -1 : 1) * 0.14;
  gear.add(strut);

  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, radius * 0.38, 20),
    materials.tyre,
  );
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(x, y, z);
  gear.add(tyre);

  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.38, radius * 0.38, radius * 0.4, 16),
    materials.metal,
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x, y, z);
  gear.add(hub);
}

function addTricycleGear(THREE, group, materials, { mainX, mainZ, noseZ, y, radius }) {
  const gear = new THREE.Group();
  addWheel(THREE, gear, materials, -mainX, y, mainZ, radius, 0);
  addWheel(THREE, gear, materials, mainX, y, mainZ, radius, 0);
  addWheel(THREE, gear, materials, 0, y + radius * 0.08, noseZ, radius * 0.72, -0.05);
  gear.userData.isLandingGear = true;
  group.add(gear);
  return gear;
}

function addPropeller(THREE, group, materials, z, radius, bladeCount = 3) {
  const propeller = new THREE.Group();
  propeller.position.z = z;
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.18, radius * 0.48, 20), materials.metal);
  spinner.rotation.x = -Math.PI / 2;
  spinner.position.z = -radius * 0.2;
  propeller.add(spinner);

  for (let index = 0; index < bladeCount; index += 1) {
    const angle = (index / bladeCount) * Math.PI * 2;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(radius * 0.085, radius * 0.88, radius * 0.035),
      materials.propeller,
    );
    blade.position.set(-Math.sin(angle) * radius * 0.44, Math.cos(angle) * radius * 0.44, 0);
    blade.rotation.z = angle;
    propeller.add(blade);
  }
  propeller.userData.isPropeller = true;
  group.add(propeller);
}

function addNavigationLights(THREE, group, span, y, z) {
  const red = new THREE.MeshStandardMaterial({ color: 0xff2139, emissive: 0xff1028, emissiveIntensity: 4 });
  const green = new THREE.MeshStandardMaterial({ color: 0x2bffae, emissive: 0x16d887, emissiveIntensity: 4 });
  const geometry = new THREE.SphereGeometry(0.07, 12, 8);
  const left = new THREE.Mesh(geometry, red);
  const right = new THREE.Mesh(geometry, green);
  left.position.set(-span, y, z);
  right.position.set(span, y, z);
  group.add(left, right);
}

function buildMaterials(THREE, aircraft) {
  return {
    body: new THREE.MeshStandardMaterial({ color: 0xf4f7f7, metalness: 0.34, roughness: 0.38 }),
    underside: new THREE.MeshStandardMaterial({ color: 0x9cabb2, metalness: 0.42, roughness: 0.46 }),
    accent: new THREE.MeshStandardMaterial({ color: aircraft.color, metalness: 0.25, roughness: 0.4 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x162b36, metalness: 0.5, roughness: 0.32 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8c5ca, metalness: 0.88, roughness: 0.23 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.88 }),
    propeller: new THREE.MeshStandardMaterial({ color: 0x242c31, metalness: 0.52, roughness: 0.36 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x66b3cf,
      metalness: 0.08,
      roughness: 0.12,
      transparent: true,
      opacity: 0.72,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    }),
  };
}

function buildTrainer(THREE, aircraft) {
  const group = new THREE.Group();
  const materials = buildMaterials(THREE, aircraft);
  const fuselage = new THREE.Mesh(fuselageGeometry(THREE, 6.3, 0.88), materials.body);
  group.add(fuselage);
  addWingPair(THREE, group, materials.body, { span: 4.35, rootChord: 1.35, tipChord: 0.64, sweep: 0.25, thickness: 0.12, y: 0.48, z: -0.25 });
  addWingPair(THREE, group, materials.body, { span: 1.9, rootChord: 0.8, tipChord: 0.38, sweep: 0.16, thickness: 0.08, y: 0.18, z: 2.15 });
  addWingPair(THREE, group, materials.accent, { span: 4.3, rootChord: 0.16, tipChord: 0.12, sweep: 0.57, thickness: 0.13, y: 0.49, z: -0.25 });

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.72, 24, 14), materials.glass);
  cockpit.scale.set(0.88, 0.72, 1.28);
  cockpit.position.set(0, 0.48, -1.1);
  group.add(cockpit);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.18, 1.42), materials.body);
  fin.rotation.x = -0.36;
  fin.position.set(0, 0.63, 2.48);
  group.add(fin);
  const finStripe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.34, 0.7), materials.accent);
  finStripe.rotation.x = -0.36;
  finStripe.position.set(0, 0.91, 2.45);
  group.add(finStripe);

  addPropeller(THREE, group, materials, -3.28, 1.02, 2);
  addTricycleGear(THREE, group, materials, { mainX: 1.2, mainZ: 0.25, noseZ: -2.28, y: -0.83, radius: 0.25 });
  addNavigationLights(THREE, group, 4.33, 0.48, 0.02);
  group.userData.retractableGear = false;
  return group;
}

function buildTurboprop(THREE, aircraft) {
  const group = new THREE.Group();
  const materials = buildMaterials(THREE, aircraft);
  const fuselage = new THREE.Mesh(fuselageGeometry(THREE, 7.8, 0.92), materials.body);
  group.add(fuselage);
  addWingPair(THREE, group, materials.body, { span: 4.8, rootChord: 1.55, tipChord: 0.62, sweep: 0.62, thickness: 0.13, y: -0.06, z: 0.1 });
  addWingPair(THREE, group, materials.accent, { span: 4.75, rootChord: 0.2, tipChord: 0.13, sweep: 1.02, thickness: 0.14, y: -0.04, z: 0.05 });
  addWingPair(THREE, group, materials.body, { span: 2.05, rootChord: 0.9, tipChord: 0.35, sweep: 0.35, thickness: 0.08, y: 0.22, z: 2.72 });

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.76, 24, 14), materials.glass);
  cockpit.scale.set(0.92, 0.65, 1.15);
  cockpit.position.set(0, 0.4, -1.95);
  group.add(cockpit);
  addWindowRow(THREE, group, materials.glass, 4, 0.56, 0.24, -0.68, 0.18);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.42, 1.5), materials.body);
  fin.rotation.x = -0.43;
  fin.position.set(0, 0.72, 3.13);
  group.add(fin);
  addPropeller(THREE, group, materials, -4.03, 1.25, 5);
  addTricycleGear(THREE, group, materials, { mainX: 1.45, mainZ: 0.62, noseZ: -2.72, y: -0.94, radius: 0.28 });
  addNavigationLights(THREE, group, 4.78, -0.02, 0.65);
  group.userData.retractableGear = true;
  return group;
}

function buildJet(THREE, aircraft) {
  const group = new THREE.Group();
  const materials = buildMaterials(THREE, aircraft);
  const fuselage = new THREE.Mesh(fuselageGeometry(THREE, 9, 1), materials.body);
  group.add(fuselage);
  addWingPair(THREE, group, materials.body, { span: 4.8, rootChord: 2.1, tipChord: 0.5, sweep: 1.65, thickness: 0.14, y: -0.14, z: 0.3 });
  addWingPair(THREE, group, materials.accent, { span: 4.72, rootChord: 0.22, tipChord: 0.1, sweep: 2.15, thickness: 0.15, y: -0.12, z: 0.2 });
  addWingPair(THREE, group, materials.body, { span: 2.25, rootChord: 1.12, tipChord: 0.32, sweep: 0.78, thickness: 0.08, y: 0.38, z: 3.25 });

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.78, 28, 16), materials.glass);
  cockpit.scale.set(0.94, 0.54, 1.32);
  cockpit.position.set(0, 0.42, -2.65);
  group.add(cockpit);
  addWindowRow(THREE, group, materials.glass, 5, 0.57, 0.25, -1.3, 0.17);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.17, 1.75, 1.72), materials.body);
  fin.rotation.x = -0.48;
  fin.position.set(0, 0.9, 3.62);
  group.add(fin);

  [-1, 1].forEach((side) => {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.05, 28), materials.dark);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(side * 1.02, 0.18, 2.22);
    group.add(engine);
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.07, 10, 24), materials.metal);
    intake.position.set(side * 1.02, 0.18, 1.18);
    group.add(intake);
  });

  addTricycleGear(THREE, group, materials, { mainX: 1.35, mainZ: 0.72, noseZ: -3.12, y: -1.02, radius: 0.3 });
  addNavigationLights(THREE, group, 4.78, -0.1, 1.68);
  group.userData.retractableGear = true;
  return group;
}

export class AircraftRenderer {
  constructor(container, stage) {
    this.container = container;
    this.stage = stage;
    this.THREE = null;
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.model = null;
    this.aircraftId = "al-182";
    this.cameraMode = "chase";
    this.propellers = [];
    this.gear = [];
    this.targetPitch = 0;
    this.targetRoll = 0;
    this.initialize();
  }

  async initialize() {
    try {
      const THREE = await import(THREE_MODULE);
      this.THREE = THREE;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.container.append(this.renderer.domElement);

      this.scene.add(new THREE.HemisphereLight(0xe7f7ff, 0x34454b, 2.7));
      const key = new THREE.DirectionalLight(0xffffff, 4.2);
      key.position.set(-5, 8, 6);
      this.scene.add(key);
      const rim = new THREE.DirectionalLight(0x69dff5, 2.2);
      rim.position.set(6, 2, -5);
      this.scene.add(rim);

      this.setAircraft(this.aircraftId);
      this.setCameraMode(this.cameraMode);
      this.resize();
      new ResizeObserver(() => this.resize()).observe(this.container);
      this.stage.classList.add("is-aircraft-3d-ready");
    } catch (error) {
      console.warn("Modèle d'avion 3D indisponible, silhouette de secours utilisée.", error);
    }
  }

  setAircraft(id) {
    this.aircraftId = getAircraft(id).id;
    if (!this.THREE || !this.scene) return;
    if (this.model) this.scene.remove(this.model);
    const aircraft = getAircraft(this.aircraftId);
    this.model =
      aircraft.id === "sj-42"
        ? buildJet(this.THREE, aircraft)
        : aircraft.id === "vt-12"
          ? buildTurboprop(this.THREE, aircraft)
          : buildTrainer(this.THREE, aircraft);
    this.model.rotation.y = 0;
    this.scene.add(this.model);
    this.propellers = [];
    this.gear = [];
    this.model.traverse((object) => {
      if (object.userData.isPropeller) this.propellers.push(object);
      if (object.userData.isLandingGear) this.gear.push(object);
    });
  }

  setCameraMode(mode) {
    this.cameraMode = ["chase", "cockpit", "top"].includes(mode) ? mode : "chase";
    if (!this.camera) return;
    if (this.cameraMode === "top") {
      this.camera.position.set(0, 14.5, 0.01);
      this.camera.lookAt(0, 0, 0);
    } else {
      this.camera.position.set(0, 4.15, 12.8);
      this.camera.lookAt(0, 0.05, 0);
    }
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(state) {
    if (!this.renderer || !this.model || !state) return;
    this.targetPitch += (degToRad(-state.pitch * 0.72) - this.targetPitch) * 0.14;
    this.targetRoll += (degToRad(-state.roll * 0.88) - this.targetRoll) * 0.14;
    this.model.rotation.x = this.cameraMode === "top" ? 0 : this.targetPitch;
    this.model.rotation.z = this.targetRoll;
    this.model.position.y = this.cameraMode === "top" ? 0 : -0.25 + Math.sin(state.elapsedSeconds * 1.4) * 0.015;
    const propellerSpeed = 0.18 + state.throttle * 0.75;
    this.propellers.forEach((propeller) => (propeller.rotation.z += propellerSpeed));
    const showGear = !this.model.userData.retractableGear || !state.airborne || state.altitude < 320;
    this.gear.forEach((gear) => (gear.visible = showGear));
    this.renderer.render(this.scene, this.camera);
  }
}
