import { AircraftRenderer } from "./aircraft-renderer.js";
import { AIRCRAFTS, getAircraft } from "./aircrafts.js";
import { DESTINATIONS, formatCoordinates, parseCoordinates, searchDestinations } from "./destinations.js";
import { clamp, FlightModel } from "./flight-model.js";
import { TerrainRenderer } from "./terrain-renderer.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const numberFormat = new Intl.NumberFormat("fr-CH", { maximumFractionDigits: 0 });
const STATS_KEY = "aeroline-pilot-stats-v1";

const defaultStats = {
  flights: 0,
  flightSeconds: 0,
  distanceKm: 0,
  bestDistanceKm: 0,
  landings: 0,
  crashes: 0,
};

const settings = {
  aircraftId: getAircraft(new URLSearchParams(window.location.search).get("aircraft")).id,
  startMode: "airborne",
  weather: "scattered",
  time: 12,
  fuel: 72,
};

const controls = {
  pitchUp: false,
  pitchDown: false,
  rollLeft: false,
  rollRight: false,
  throttleUp: false,
  throttleDown: false,
  resetAttitude: false,
};

let stats = loadStats();
let selectedDestination = destinationFromUrl() ?? DESTINATIONS[0];
let currentScreen = "home";
let model = null;
let animationFrame = 0;
let lastFrameTime = 0;
let lastMapRender = 0;
let paused = false;
let hudHidden = false;
let cameraMode = 0;
let autopilotEnabled = false;
let flightCommitted = false;
let lastEventRevision = 0;
let messageTimer = 0;

const previewRenderer = new TerrainRenderer($("#preview-map-webgl"), $("#preview-map-fallback"), { preview: true });
const flightRenderer = new TerrainRenderer($("#flight-map-webgl"), $("#flight-map-fallback"));
const aircraftRenderer = new AircraftRenderer($("#aircraft-3d"), $("#flight-stage"));

init();

function init() {
  bindNavigation();
  bindExplore();
  bindAircraftSelection();
  bindFlightControls();
  renderDestinationList();
  selectDestination(selectedDestination);
  selectAircraft(settings.aircraftId);
  updateFuelLabel();
  updateSetupSummary();
  updateStatsUi();

  $("#quick-flight").addEventListener("click", startFlight);
  $("#takeoff-button").addEventListener("click", startFlight);
  $("#retry-button").addEventListener("click", () => {
    $("#result-dialog").close();
    startFlight();
  });
  $("#result-exit").addEventListener("click", () => {
    $("#result-dialog").close();
    exitFlight("home");
  });

  window.addEventListener("resize", () => {
    previewRenderer.render();
    if (model) flightRenderer.render(model.snapshot());
  });
}

function bindAircraftSelection() {
  $("#aircraft-select").addEventListener("change", (event) => selectAircraft(event.target.value));
  $$('[data-aircraft-step]').forEach((button) => {
    button.addEventListener("click", () => {
      const currentIndex = AIRCRAFTS.findIndex((aircraft) => aircraft.id === settings.aircraftId);
      const step = Number(button.dataset.aircraftStep);
      const nextIndex = (currentIndex + step + AIRCRAFTS.length) % AIRCRAFTS.length;
      selectAircraft(AIRCRAFTS[nextIndex].id);
    });
  });
  $$('[data-aircraft-id]').forEach((button) => {
    button.addEventListener("click", () => selectAircraft(button.dataset.aircraftId));
  });
}

function selectAircraft(id) {
  const aircraft = getAircraft(id);
  settings.aircraftId = aircraft.id;
  $("#aircraft-select").value = aircraft.id;
  $("#aircraft-card").dataset.aircraft = aircraft.id;
  $("#aircraft-name").textContent = aircraft.name;
  $("#aircraft-description").textContent = aircraft.description;
  $("#aircraft-cruise").textContent = `${aircraft.cruiseSpeed} kt`;
  $("#aircraft-power").textContent = aircraft.power;
  $("#aircraft-endurance").textContent = aircraft.endurance;
  $("#aircraft-ceiling").textContent = `${numberFormat.format(aircraft.ceiling)} ft`;
  $$('[data-aircraft-id]').forEach((button) => {
    const selected = button.dataset.aircraftId === aircraft.id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  aircraftRenderer.setAircraft(aircraft.id);
  updateFuelLabel();
  updateSetupSummary();
}

function bindNavigation() {
  $$('[data-screen-target]').forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.screenTarget;
      if (target === "flight") startFlight();
      else showScreen(target);
    });
  });
}

function showScreen(name) {
  if (name === "flight" && !model) {
    startFlight();
    return;
  }

  currentScreen = name;
  $$(".screen").forEach((screen) => screen.classList.toggle("is-active", screen.id === `screen-${name}`));
  $$(".nav-link").forEach((link) => link.classList.toggle("is-active", link.dataset.screenTarget === name));
  document.body.classList.toggle("is-flying", name === "flight");

  if (name === "explore") {
    requestAnimationFrame(() => previewRenderer.setFocus(selectedDestination.lat, selectedDestination.lon));
    $("#destination-search").focus({ preventScroll: true });
  }
  if (name === "home") updateStatsUi();
  window.scrollTo({ top: 0, behavior: "instant" });
}

function bindExplore() {
  const search = $("#destination-search");
  const results = $("#search-results");

  search.addEventListener("input", () => renderSearchResults(search.value));
  search.addEventListener("focus", () => renderSearchResults(search.value));
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") results.hidden = true;
  });

  $("#destination-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const custom = parseCoordinates(search.value);
    const first = searchDestinations(search.value)[0];
    if (custom || first) {
      selectDestination(custom ?? first);
      search.value = "";
      results.hidden = true;
    } else {
      results.innerHTML = '<p class="search-result"><span>Aucune destination. Essaie « Dubai » ou « 25.20, 55.27 ».</span></p>';
      results.hidden = false;
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#destination-form")) results.hidden = true;
  });

  $$(".segmented").forEach((group) => {
    group.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) return;
      $$("button", group).forEach((item) => item.classList.toggle("is-selected", item === button));
      settings[group.dataset.setting] = button.dataset.value;
      updateSetupSummary();
    });
  });

  $("#time-select").addEventListener("change", (event) => {
    settings.time = Number(event.target.value);
    updateSetupSummary();
  });

  $("#fuel-range").addEventListener("input", (event) => {
    settings.fuel = Number(event.target.value);
    updateFuelLabel();
  });

  $("#share-button").addEventListener("click", shareFlight);

  const helpDialog = $("#help-dialog");
  $(".controls-help").addEventListener("click", () => helpDialog.showModal());
  $(".dialog-close", helpDialog).addEventListener("click", () => helpDialog.close());
}

function renderDestinationList() {
  const list = $("#destination-list");
  list.innerHTML = "";
  DESTINATIONS.slice(0, 10).forEach((destination, index) => {
    const item = document.createElement("li");
    item.innerHTML = `
      <button class="destination-item" data-destination="${destination.id}">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span><b>${destination.city}</b><small>${destination.country}</small></span>
        <em>${destination.visits}</em>
      </button>`;
    $("button", item).addEventListener("click", () => selectDestination(destination));
    list.append(item);
  });
}

function renderSearchResults(query) {
  const results = $("#search-results");
  const custom = parseCoordinates(query);
  const matches = searchDestinations(query);
  const choices = custom ? [custom, ...matches] : matches;

  results.innerHTML = "";
  choices.forEach((destination) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result";
    button.innerHTML = `<b>${destination.city}</b><span>${destination.country}</span>`;
    button.addEventListener("click", () => {
      selectDestination(destination);
      $("#destination-search").value = "";
      results.hidden = true;
    });
    results.append(button);
  });
  results.hidden = choices.length === 0;
}

function selectDestination(destination) {
  selectedDestination = destination;
  $("#selected-city").textContent = destination.city;
  $("#selected-coords").textContent = formatCoordinates(destination.lat, destination.lon);
  $$(".destination-item").forEach((item) => item.classList.toggle("is-selected", item.dataset.destination === destination.id));
  previewRenderer.setFocus(destination.lat, destination.lon, destination.heading ?? 0);
}

function updateFuelLabel() {
  $("#fuel-label").textContent = `${settings.fuel} % de carburant`;
  const fullEndurance = Number.parseFloat(getAircraft(settings.aircraftId).endurance);
  const hours = ((settings.fuel / 100) * fullEndurance).toFixed(1).replace(".", " h ");
  $("#fuel-range-label").textContent = `≈ ${hours} d'autonomie`;
}

function updateSetupSummary() {
  const weatherNames = { clear: "Clair", scattered: "Épars", windy: "Vent" };
  $("#setup-summary").textContent = `${getAircraft(settings.aircraftId).shortName} · ${String(settings.time).padStart(2, "0")}:00 · ${weatherNames[settings.weather]}`;
}

async function shareFlight() {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("lat", selectedDestination.lat.toFixed(5));
  url.searchParams.set("lon", selectedDestination.lon.toFixed(5));
  url.searchParams.set("city", selectedDestination.city);
  url.searchParams.set("heading", selectedDestination.heading ?? 0);
  url.searchParams.set("aircraft", settings.aircraftId);

  const button = $("#share-button");
  try {
    await navigator.clipboard.writeText(url.toString());
    button.textContent = "Lien copié ✓";
  } catch {
    window.prompt("Copie ce lien de vol :", url.toString());
  }
  window.setTimeout(() => (button.textContent = "Copier le vol"), 1800);
}

function startFlight() {
  cancelAnimationFrame(animationFrame);
  if ($("#result-dialog").open) $("#result-dialog").close();

  model = new FlightModel({
    lat: selectedDestination.lat,
    lon: selectedDestination.lon,
    heading: selectedDestination.heading ?? 0,
    aircraftId: settings.aircraftId,
    startMode: settings.startMode,
    fuel: settings.fuel,
    windStrength: settings.weather === "windy" ? 0.9 : settings.weather === "scattered" ? 0.2 : 0,
  });

  paused = false;
  hudHidden = false;
  cameraMode = 0;
  autopilotEnabled = false;
  flightCommitted = false;
  lastEventRevision = 0;
  lastFrameTime = performance.now();
  lastMapRender = 0;
  Object.keys(controls).forEach((key) => (controls[key] = false));

  const stage = $("#flight-stage");
  stage.dataset.time = String(settings.time);
  stage.dataset.weather = settings.weather;
  stage.dataset.camera = "chase";
  stage.dataset.aircraft = settings.aircraftId;
  flightRenderer.setCameraMode("chase");
  aircraftRenderer.setAircraft(settings.aircraftId);
  aircraftRenderer.setCameraMode("chase");
  stage.classList.remove("is-paused", "is-hud-hidden");
  $("#pause-button").textContent = "Ⅱ";
  $("#autopilot-button").setAttribute("aria-pressed", "false");

  prepareBriefing();
  showScreen("flight");
  renderFlight(model.snapshot(), true);
  animationFrame = requestAnimationFrame(flightLoop);
  window.setTimeout(() => $("#briefing-overlay").classList.add("is-hidden"), 2100);
}

function prepareBriefing() {
  const startNames = { airborne: "En vol", runway: "Sur la piste", parking: "Au parking" };
  const weatherNames = { clear: "Clair", scattered: "Épars", windy: "Venteux" };
  $("#briefing-overlay").classList.remove("is-hidden");
  $("#briefing-city").textContent = selectedDestination.city;
  $("#briefing-copy").textContent = `Vol libre au-dessus de ${selectedDestination.city}. Prends une ligne, stabilise l'appareil et explore la région.`;
  $("#briefing-aircraft").textContent = getAircraft(settings.aircraftId).shortName;
  $("#briefing-start").textContent = startNames[settings.startMode];
  $("#briefing-time").textContent = `${String(settings.time).padStart(2, "0")}:00`;
  $("#briefing-weather").textContent = weatherNames[settings.weather];
  $("#briefing-fuel").textContent = `${settings.fuel} %`;
}

function bindFlightControls() {
  window.addEventListener("keydown", (event) => {
    if (currentScreen !== "flight") return;
    const key = event.key.toLowerCase();
    const controlled = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "s", "a", "p", "c", "h", "r", "escape"];
    if (controlled.includes(key)) event.preventDefault();

    if (key === "arrowup") controls.pitchUp = true;
    if (key === "arrowdown") controls.pitchDown = true;
    if (key === "arrowleft") controls.rollLeft = true;
    if (key === "arrowright") controls.rollRight = true;
    if (key === "w") controls.throttleUp = true;
    if (key === "s") controls.throttleDown = true;
    if (key === "r") controls.resetAttitude = true;

    if (!event.repeat) {
      if (key === "a") toggleAutopilot();
      if (key === "p") togglePause();
      if (key === "c") changeCamera();
      if (key === "h") toggleHud();
      if (key === "escape") exitFlight("explore");
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();
    if (key === "arrowup") controls.pitchUp = false;
    if (key === "arrowdown") controls.pitchDown = false;
    if (key === "arrowleft") controls.rollLeft = false;
    if (key === "arrowright") controls.rollRight = false;
    if (key === "w") controls.throttleUp = false;
    if (key === "s") controls.throttleDown = false;
    if (key === "r") controls.resetAttitude = false;
  });

  $$("[data-control]").forEach((button) => {
    const name = button.dataset.control;
    const stop = (event) => {
      event.preventDefault();
      controls[name] = false;
    };
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      controls[name] = true;
    });
    button.addEventListener("pointerup", stop);
    button.addEventListener("pointercancel", stop);
    button.addEventListener("lostpointercapture", stop);
  });

  $("#exit-flight").addEventListener("click", () => exitFlight("explore"));
  $("#autopilot-button").addEventListener("click", toggleAutopilot);
  $("#camera-button").addEventListener("click", changeCamera);
  $("#pause-button").addEventListener("click", togglePause);
}

function flightLoop(now) {
  if (!model || currentScreen !== "flight") return;
  const dt = Math.min(0.12, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  if (!paused) {
    const input = readControls();
    const state = model.step(dt, input);
    autopilotEnabled = state.autopilot;
    renderFlight(state, now - lastMapRender > 90);
    if (now - lastMapRender > 90) lastMapRender = now;
    handleFlightEvent(state);
  }

  animationFrame = requestAnimationFrame(flightLoop);
}

function readControls() {
  let pitch = Number(controls.pitchUp) - Number(controls.pitchDown);
  let roll = Number(controls.rollRight) - Number(controls.rollLeft);
  let throttle = Number(controls.throttleUp) - Number(controls.throttleDown);

  const gamepad = navigator.getGamepads?.().find(Boolean);
  if (gamepad) {
    const deadzone = (value) => (Math.abs(value) < 0.12 ? 0 : value);
    roll += deadzone(gamepad.axes[0] ?? 0);
    pitch -= deadzone(gamepad.axes[1] ?? 0);
    throttle += (gamepad.buttons[7]?.value ?? 0) - (gamepad.buttons[6]?.value ?? 0);
  }

  return {
    pitch: clamp(pitch, -1, 1),
    roll: clamp(roll, -1, 1),
    throttle: clamp(throttle, -1, 1),
    autopilot: autopilotEnabled,
    resetAttitude: controls.resetAttitude,
  };
}

function renderFlight(state, renderMap = false) {
  $("#speed-value").textContent = numberFormat.format(state.speed);
  $("#altitude-value").textContent = numberFormat.format(Math.max(0, state.altitude));
  $("#vertical-value").textContent = `${state.verticalSpeed >= 0 ? "+" : ""}${numberFormat.format(state.verticalSpeed)} ft/min`;
  $("#distance-value").textContent = `${(state.distanceNm * 1.852).toFixed(1)} km`;
  $("#heading-value").textContent = `${String(Math.round(state.heading) % 360).padStart(3, "0")}°`;
  $("#heading-side-value").textContent = String(Math.round(state.heading) % 360).padStart(3, "0");
  $("#throttle-value").textContent = numberFormat.format(state.throttle * 100);
  $("#flight-fuel-value").textContent = `${numberFormat.format(state.fuel)} %`;
  $("#flight-status").textContent = state.autopilot ? "PILOTE AUTO" : state.airborne ? "EN VOL" : "AU SOL";
  $("#location-value").textContent = `${selectedDestination.city} · ${state.lat.toFixed(3)}, ${state.lon.toFixed(3)}`;
  $("#autopilot-button").setAttribute("aria-pressed", String(state.autopilot));

  const plane = $("#aircraft-view");
  plane.style.transform = `translate(-50%, -50%) translateY(${state.pitch * 0.65}px) rotate(${state.roll * 0.72}deg)`;
  plane.style.setProperty("--prop-speed", `${(0.055 + (1 - state.throttle) * 0.13).toFixed(3)}s`);
  plane.style.setProperty("--prop-opacity", (0.36 + state.throttle * 0.5).toFixed(3));
  const groundProximity = clamp(1 - state.altitude / 600, 0, 1);
  plane.style.setProperty("--shadow-opacity", (groundProximity * 0.2).toFixed(3));
  plane.style.setProperty("--shadow-scale", (0.58 + groundProximity * 0.38).toFixed(3));
  $("#attitude-ball").style.transform = `rotate(${-state.roll}deg) translateY(${state.pitch * 1.5}px)`;
  aircraftRenderer.render(state);

  if (renderMap) flightRenderer.render(state);
}

function handleFlightEvent(state) {
  if (state.eventRevision === lastEventRevision) return;
  lastEventRevision = state.eventRevision;

  const messages = {
    takeoff: "Vitesse de rotation — décollage !",
    "autopilot-on": "Pilote automatique engagé",
    "autopilot-off": "Pilotage manuel",
    "fuel-empty": "Réservoir vide — vol plané",
  };
  if (messages[state.event]) showMessage(messages[state.event]);
  if (state.event === "landed" || state.event === "crashed") finishFlight(state);
}

function toggleAutopilot() {
  if (!model || !model.state.airborne) {
    showMessage("Le pilote automatique nécessite d'être en vol");
    return;
  }
  autopilotEnabled = !autopilotEnabled;
  model.setAutopilot(autopilotEnabled);
  $("#autopilot-button").setAttribute("aria-pressed", String(autopilotEnabled));
}

function togglePause() {
  if (!model) return;
  paused = !paused;
  $("#flight-stage").classList.toggle("is-paused", paused);
  $("#pause-button").textContent = paused ? "▶" : "Ⅱ";
  if (!paused) lastFrameTime = performance.now();
}

function changeCamera() {
  const cameras = ["chase", "cockpit", "top"];
  cameraMode = (cameraMode + 1) % cameras.length;
  $("#flight-stage").dataset.camera = cameras[cameraMode];
  flightRenderer.setCameraMode(cameras[cameraMode]);
  aircraftRenderer.setCameraMode(cameras[cameraMode]);
  showMessage({ chase: "Caméra poursuite", cockpit: "Vue cockpit", top: "Vue tactique" }[cameras[cameraMode]]);
}

function toggleHud() {
  hudHidden = !hudHidden;
  $("#flight-stage").classList.toggle("is-hud-hidden", hudHidden);
}

function showMessage(text) {
  const message = $("#flight-message");
  message.textContent = text;
  message.classList.add("is-visible");
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => message.classList.remove("is-visible"), 1900);
}

function finishFlight(state) {
  if (flightCommitted) return;
  flightCommitted = true;
  paused = true;
  commitFlightStats(state);

  const success = state.landed;
  $("#result-eyebrow").textContent = success ? "MISSION ACCOMPLIE" : "VOL TERMINÉ";
  $("#result-title").textContent = success ? "Atterrissage réussi" : "Appareil endommagé";
  $("#result-copy").textContent = success
    ? "Belle approche. L'appareil est posé et le carnet de vol a été mis à jour."
    : "L'impact était trop fort ou l'appareil trop incliné. Réduis la vitesse et stabilise le roulis avant le contact.";
  $("#result-distance").textContent = `${(state.distanceNm * 1.852).toFixed(1)} km`;
  $("#result-duration").textContent = formatDuration(state.elapsedSeconds);
  $("#result-impact").textContent = `${numberFormat.format(state.impactRate)} ft/min`;
  window.setTimeout(() => $("#result-dialog").showModal(), 350);
}

function exitFlight(target) {
  if (model && !flightCommitted && model.state.elapsedSeconds > 4) commitFlightStats(model.snapshot());
  cancelAnimationFrame(animationFrame);
  model = null;
  paused = false;
  $("#briefing-overlay").classList.add("is-hidden");
  showScreen(target);
}

function commitFlightStats(state) {
  if (flightCommitted && state.event !== "landed" && state.event !== "crashed") return;
  stats.flights += 1;
  stats.flightSeconds += Math.round(state.elapsedSeconds);
  const distanceKm = state.distanceNm * 1.852;
  stats.distanceKm += distanceKm;
  stats.bestDistanceKm = Math.max(stats.bestDistanceKm, distanceKm);
  if (state.landed) stats.landings += 1;
  if (state.crashed) stats.crashes += 1;
  saveStats();
  flightCommitted = true;
}

function updateStatsUi() {
  const minutes = Math.round(stats.flightSeconds / 60);
  const rank = getRank();
  $("#header-rank").textContent = rank.name;
  $("#header-hours").textContent = `${minutes} min de vol`;
  $("#progress-rank").textContent = rank.name;
  $("#progress-next").textContent = rank.next;
  $("#rank-progress").style.width = `${rank.progress}%`;
  $("#metric-distance").textContent = numberFormat.format(stats.distanceKm);
  $("#metric-landings").textContent = numberFormat.format(stats.landings);
  $("#metric-best").textContent = stats.bestDistanceKm ? `${stats.bestDistanceKm.toFixed(1)} km` : "—";

  setBadge("#badge-flight", stats.flights > 0);
  setBadge("#badge-landing", stats.landings > 0);
  setBadge("#badge-distance", stats.distanceKm >= 25);
  const completed = Number(stats.flights > 0) + Number(stats.landings > 0) + Number(stats.distanceKm >= 25);
  $("#training-count").textContent = `${completed} / 3`;
  $("#training-progress").style.width = `${(completed / 3) * 100}%`;
}

function setBadge(selector, done) {
  const badge = $(selector);
  badge.textContent = done ? "ACQUIS ✓" : "À FAIRE";
  badge.classList.toggle("is-done", done);
}

function getRank() {
  if (stats.landings >= 10 && stats.flightSeconds >= 7200) return { name: "Pilote confirmé", next: "Toutes les qualifications du MVP sont acquises", progress: 100 };
  if (stats.landings >= 3 && stats.flightSeconds >= 1800) return { name: "Pilote privé", next: "10 atterrissages pour la qualification suivante", progress: clamp((stats.landings / 10) * 100, 35, 90) };
  if (stats.landings >= 1) return { name: "Pilote solo", next: "3 atterrissages et 30 minutes pour la licence privée", progress: clamp(25 + stats.landings * 12, 25, 65) };
  return { name: "Élève pilote", next: "Premier atterrissage à réussir", progress: Math.min(22, stats.flights * 7) };
}

function loadStats() {
  try {
    return { ...defaultStats, ...JSON.parse(localStorage.getItem(STATS_KEY)) };
  } catch {
    return { ...defaultStats };
  }
}

function saveStats() {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // La simulation reste jouable si le stockage est bloqué par le navigateur.
  }
}

function destinationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("lat") || !params.has("lon")) return null;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return {
    id: "shared-flight",
    city: params.get("city")?.slice(0, 50) || "Vol partagé",
    country: formatCoordinates(lat, lon),
    lat,
    lon,
    heading: Number(params.get("heading")) || 0,
    visits: "Vol partagé",
    accent: "#25d6f5",
  };
}

function formatDuration(seconds) {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return `${minutes} min ${remaining.toString().padStart(2, "0")}`;
}
