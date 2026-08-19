import { clamp } from "./flight-model.js";
import { MapRenderer } from "./map-renderer.js";

const MAPLIBRE_MODULE = "https://unpkg.com/maplibre-gl@6.4.1/dist/maplibre-gl.mjs";
const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg";
export const TERRAIN_EXAGGERATION = 1.2;

const CAMERA_PRESETS = {
  chase: { pitchOffset: 0, zoomOffset: 0, rollFactor: -0.18 },
  cockpit: { pitchOffset: 4, zoomOffset: 0.25, rollFactor: -0.3 },
  top: { pitch: 0, zoomOffset: 0.3, rollFactor: 0 },
};

export function terrainCameraForAltitude(altitude, preview = false) {
  if (preview) return { zoom: 11.8, pitch: 55 };
  const safeAltitude = Math.max(0, Number(altitude) || 0);
  const heightRatio = clamp(
    Math.log2(1 + safeAltitude / 160) / Math.log2(1 + 14000 / 160),
    0,
    1,
  );

  return {
    // Le changement est volontairement marqué sous 2 500 ft : le sol doit se rapprocher visiblement.
    zoom: clamp(16.1 - Math.log2(1 + safeAltitude / 300), 11.05, 16.1),
    // Une caméra plus rasante près du sol renforce l'approche sans déformer le relief.
    pitch: 79 - heightRatio * 13,
  };
}

export function shouldUpdateTerrainCamera(previous, next) {
  if (!previous) return true;
  return (
    Math.abs(previous.lon - next.lon) > 1e-7 ||
    Math.abs(previous.lat - next.lat) > 1e-7 ||
    Math.abs(previous.bearing - next.bearing) > 0.02 ||
    Math.abs(previous.zoom - next.zoom) > 0.002 ||
    Math.abs(previous.pitch - next.pitch) > 0.02 ||
    Math.abs(previous.roll - next.roll) > 0.02
  );
}

export function terrainZoomForAltitude(altitude, preview = false) {
  return terrainCameraForAltitude(altitude, preview).zoom;
}

export class TerrainRenderer {
  constructor(webglContainer, fallbackCanvas, { preview = false } = {}) {
    this.webglContainer = webglContainer;
    this.root = webglContainer.parentElement;
    this.preview = preview;
    this.fallback = new MapRenderer(fallbackCanvas, { preview });
    this.focus = { lat: 46.5197, lon: 6.6323, heading: 0, altitude: 2200, pitch: 0, roll: 0 };
    this.cameraMode = "chase";
    this.map = null;
    this.ready = false;
    this.destroyed = false;
    this.lastCamera = null;
    this.initialize();
  }

  async initialize() {
    try {
      const maplibregl = await import(MAPLIBRE_MODULE);
      if (this.destroyed) return;

      this.map = new maplibregl.Map({
        container: this.webglContainer,
        style: this.createStyle(),
        center: [this.focus.lon, this.focus.lat],
        zoom: terrainZoomForAltitude(this.focus.altitude, this.preview),
        bearing: this.focus.heading,
        pitch: terrainCameraForAltitude(this.focus.altitude, this.preview).pitch,
        interactive: this.preview,
        dragRotate: this.preview,
        touchPitch: this.preview,
        maxPitch: 85,
        maxZoom: 17.5,
        attributionControl: false,
        antialias: true,
        fadeDuration: 0,
        renderWorldCopies: false,
      });

      this.map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        this.preview ? "bottom-left" : "bottom-right",
      );

      this.map.once("load", () => {
        if (this.destroyed) return;
        this.ready = true;
        this.root.classList.add("is-webgl-ready");
        this.map.resize();
        this.render(this.focus);
      });

      this.map.on("error", (event) => {
        // Une tuile indisponible ne doit pas interrompre le vol. Le canevas de secours reste dessous.
        if (!event?.error?.message?.includes("tile")) console.warn("Terrain 3D:", event.error);
      });
    } catch (error) {
      console.warn("WebGL indisponible, utilisation de la carte de secours.", error);
      this.root.classList.add("is-fallback-map");
    }
  }

  createStyle() {
    return {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: [SATELLITE_TILES],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 14,
          attribution:
            '<a href="https://cloudless.eox.at" target="_blank">EOxCloudless</a> · modified Copernicus Sentinel data 2025',
        },
        terrain: {
          type: "raster-dem",
          url: TERRAIN_TILEJSON,
          tileSize: 512,
        },
        hillshade: {
          type: "raster-dem",
          url: TERRAIN_TILEJSON,
          tileSize: 512,
        },
      },
      layers: [
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          paint: {
            "raster-opacity": 0.98,
            "raster-saturation": 0.06,
            "raster-contrast": 0.1,
            "raster-brightness-min": 0.06,
            "raster-brightness-max": 0.93,
            "raster-fade-duration": 0,
            "raster-resampling": "linear",
          },
        },
        {
          id: "terrain-shadows",
          type: "hillshade",
          source: "hillshade",
          paint: {
            "hillshade-exaggeration": 0.46,
            "hillshade-shadow-color": "#07121b",
            "hillshade-highlight-color": "#f3e2bd",
            "hillshade-accent-color": "#345065",
            "hillshade-illumination-direction": 325,
          },
        },
      ],
      terrain: {
        source: "terrain",
        exaggeration: TERRAIN_EXAGGERATION,
      },
      sky: {
        "sky-color": "#77b1d2",
        "sky-horizon-blend": 0.12,
        "horizon-color": "#d9e8eb",
        "fog-color": "#a9c5d2",
        "fog-ground-blend": 0.18,
      },
    };
  }

  setFocus(lat, lon, heading = 0, altitude = 2200) {
    this.focus = { ...this.focus, lat, lon, heading, altitude };
    if (!this.ready) this.fallback.setFocus(lat, lon, heading, altitude);
    this.render(this.focus);
  }

  setCameraMode(mode) {
    this.cameraMode = CAMERA_PRESETS[mode] ? mode : "chase";
    this.render(this.focus);
  }

  render(focus = this.focus) {
    this.focus = { ...this.focus, ...focus };
    if (!this.ready || !this.map) {
      this.fallback.render(this.focus);
      return;
    }

    const preset = this.preview
      ? { pitch: 55, zoomOffset: 0, rollFactor: 0 }
      : CAMERA_PRESETS[this.cameraMode];
    const altitudeCamera = terrainCameraForAltitude(this.focus.altitude, this.preview);
    const zoom = altitudeCamera.zoom + preset.zoomOffset;
    const basePitch = Number.isFinite(preset.pitch)
      ? preset.pitch
      : altitudeCamera.pitch + preset.pitchOffset;
    const pitch = this.preview
      ? basePitch
      : clamp(basePitch + (this.focus.pitch || 0) * 0.12, 0, 85);
    const roll = clamp((this.focus.roll || 0) * preset.rollFactor, -13, 13);

    const camera = {
      lon: this.focus.lon,
      lat: this.focus.lat,
      bearing: this.focus.heading || 0,
      zoom,
      pitch,
      roll,
    };
    if (!shouldUpdateTerrainCamera(this.lastCamera, camera)) return;
    this.lastCamera = camera;

    this.map.jumpTo({
      center: [this.focus.lon, this.focus.lat],
      bearing: camera.bearing,
      zoom,
      pitch,
      roll,
    });
  }

  destroy() {
    this.destroyed = true;
    this.fallback.destroy();
    this.map?.remove();
    this.map = null;
  }
}
