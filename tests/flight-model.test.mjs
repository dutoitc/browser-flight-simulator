import test from "node:test";
import assert from "node:assert/strict";

import { AIRCRAFTS, getAircraft } from "../src/aircrafts.js";
import { aircraftPitchRotation } from "../src/aircraft-renderer.js";
import { FlightModel, shortestAngle } from "../src/flight-model.js";
import {
  TERRAIN_EXAGGERATION,
  shouldUpdateTerrainCamera,
  terrainCameraForAltitude,
  terrainZoomForAltitude,
} from "../src/terrain-renderer.js";

const advance = (model, seconds, controls = {}) => {
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) model.step(0.1, controls);
  return model.snapshot();
};

test("un vol en l'air démarre avec des paramètres cohérents", () => {
  const state = new FlightModel({ startMode: "airborne", lat: 25.2, lon: 55.27 }).snapshot();
  assert.equal(state.airborne, true);
  assert.equal(state.altitude, 2200);
  assert.equal(state.speed, 105);
  assert.equal(state.lat, 25.2);
  assert.equal(state.lon, 55.27);
});

test("les cinq appareils proposent des performances nettement distinctes", () => {
  assert.equal(AIRCRAFTS.length, 5);
  assert.ok(getAircraft("vt-12").maxSpeed > getAircraft("al-182").maxSpeed);
  assert.ok(getAircraft("sj-42").maxSpeed > getAircraft("vt-12").maxSpeed);
  assert.ok(getAircraft("fx-19").maxSpeed > getAircraft("sj-42").maxSpeed);
  assert.ok(getAircraft("ufo-x1").maxSpeed > 4000);
  assert.equal(getAircraft("inconnu").id, "al-182");
});

test("le jet léger permet un vol bien plus rapide que le monomoteur", () => {
  const state = new FlightModel({ startMode: "airborne", aircraftId: "sj-42" }).snapshot();
  assert.equal(state.aircraftId, "sj-42");
  assert.ok(state.speed > getAircraft("al-182").maxSpeed);
  assert.ok(state.speed <= getAircraft("sj-42").maxSpeed);
});

test("le chasseur et la soucoupe démarrent à leur vitesse de croisière rapide", () => {
  const fighter = new FlightModel({ startMode: "airborne", aircraftId: "fx-19" }).snapshot();
  const ufo = new FlightModel({ startMode: "airborne", aircraftId: "ufo-x1" }).snapshot();
  assert.ok(fighter.speed >= 600);
  assert.ok(ufo.speed >= 1500);
  assert.ok(ufo.speed > fighter.speed);
});

test("le tangage 3D suit le sens réel de montée et de descente", () => {
  assert.ok(aircraftPitchRotation(8) > 0, "une montée doit lever le nez");
  assert.ok(aircraftPitchRotation(-8) < 0, "une descente doit baisser le nez");
  assert.equal(aircraftPitchRotation(0), 0);
});

test("la puissance accélère l'appareil au sol", () => {
  const model = new FlightModel({ startMode: "runway" });
  const initialSpeed = model.state.speed;
  const state = advance(model, 8, { throttle: 1 });
  assert.ok(state.speed > initialSpeed + 10);
  assert.ok(state.throttle > 0.8);
});

test("l'appareil décolle après rotation à vitesse suffisante", () => {
  const model = new FlightModel({ startMode: "runway" });
  const state = advance(model, 22, { throttle: 1, pitch: 0.65 });
  assert.equal(state.airborne, true);
  assert.ok(state.altitude > 0);
  assert.ok(state.speed > 50);
});

test("le roulis modifie progressivement le cap", () => {
  const model = new FlightModel({ startMode: "airborne", heading: 0 });
  const state = advance(model, 4, { roll: 0.8 });
  assert.ok(state.roll > 20);
  assert.ok(state.heading > 3);
});

test("le pilote automatique rejoint le cap et l'altitude cibles", () => {
  const model = new FlightModel({ startMode: "airborne", heading: 10, altitude: 2000 });
  model.setAutopilot(true);
  model.setAutopilotTarget({ heading: 70, altitude: 2800, speed: 110 });
  const beforeHeadingError = Math.abs(shortestAngle(model.state.heading, 70));
  const beforeAltitudeError = Math.abs(model.state.altitude - 2800);
  const state = advance(model, 18, { autopilot: true });
  assert.ok(Math.abs(shortestAngle(state.heading, 70)) < beforeHeadingError);
  assert.ok(Math.abs(state.altitude - 2800) < beforeAltitudeError);
});

test("un contact stabilisé est compté comme atterrissage", () => {
  const model = new FlightModel({ startMode: "airborne" });
  Object.assign(model.state, { altitude: 0.2, verticalSpeed: -260, pitch: -1, roll: 0, speed: 72 });
  const state = model.step(0.1);
  assert.equal(state.landed, true);
  assert.equal(state.crashed, false);
  assert.equal(state.event, "landed");
});

test("un contact trop incliné est compté comme crash", () => {
  const model = new FlightModel({ startMode: "airborne" });
  Object.assign(model.state, { altitude: 0.2, verticalSpeed: -950, pitch: -7, roll: 30, speed: 104 });
  const state = model.step(0.1);
  assert.equal(state.crashed, true);
  assert.equal(state.landed, false);
  assert.equal(state.event, "crashed");
});

test("la position et le carburant évoluent pendant le vol", () => {
  const model = new FlightModel({ startMode: "airborne", lat: 46.5, lon: 6.6, fuel: 60 });
  const state = advance(model, 10, { throttle: 0.3 });
  assert.notEqual(state.lat, 46.5);
  assert.notEqual(state.lon, 6.6);
  assert.ok(state.distanceNm > 0);
  assert.ok(state.fuel < 60);
});

test("la caméra 3D élargit le champ de vision avec l'altitude", () => {
  assert.ok(terrainZoomForAltitude(100) > terrainZoomForAltitude(2500));
  assert.ok(terrainZoomForAltitude(2500) > terrainZoomForAltitude(12000));
  assert.ok(terrainZoomForAltitude(100) - terrainZoomForAltitude(2500) > 2);
  assert.ok(terrainCameraForAltitude(100).pitch > terrainCameraForAltitude(12000).pitch);
  assert.equal(terrainZoomForAltitude(2200, true), 11.8);
});

test("le relief reste naturel et ne dépasse pas une exagération de 1,2", () => {
  assert.equal(TERRAIN_EXAGGERATION, 1.2);
});

test("la caméra de terrain ignore les micro-variations qui faisaient scintiller le sol", () => {
  const camera = { lon: 6.6323, lat: 46.5197, bearing: 20, zoom: 15, pitch: 74, roll: 0 };
  assert.equal(shouldUpdateTerrainCamera(null, camera), true);
  assert.equal(shouldUpdateTerrainCamera(camera, { ...camera }), false);
  assert.equal(shouldUpdateTerrainCamera(camera, { ...camera, lon: camera.lon + 1e-8 }), false);
  assert.equal(shouldUpdateTerrainCamera(camera, { ...camera, lon: camera.lon + 1e-5 }), true);
});
