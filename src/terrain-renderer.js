import { clamp } from "./flight-model.js";
import { MapRenderer } from "./map-renderer.js";

const MAPLIBRE_MODULE = "https://unpkg.com/maplibre-gl@6.4.1/dist/maplibre-gl.mjs";
const TERRAIN_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json";
const SATELLITE_TILES =
  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg";

const CAMERA_PRESETS = {
  chase: { pitch: 74, zoomOffset: 0, rollFactor: -0.22 },
  cockpit: { pitch: 82, zoomOffset: 0.35, rollFactor: -0.38 },
  top: { pitch: 0, zoomOffset: 0.15, rollFactor: 0 },
};

export function terrainZoomForAltitude(altitude, preview = false) {
  if (preview) return 11.8;
  const safeAltitude = Math.max(0, Number(altitude) || 0);
  return clamp(15.4 - Math.log2(1 + safeAltitude / 650), 11.25, 15.4);
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
        pitch: this.preview ? 55 : CAMERA_PRESETS.chase.pitch,
        interactive: this.preview,
        dragRotate: this.preview,
        touchPitch: this.preview,
        maxPitch: 85,
        maxZoom: 17,
        attributionControl: false,
        antialias: true,
        fadeDuration: 350,
        renderWorldCopies: true,
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
            "raster-saturation": 0.12,
            "raster-contrast": 0.16,
            "raster-brightness-min": 0.06,
            "raster-brightness-max": 0.93,
            "raster-fade-duration": 250,
          },
        },
        {
          id: "terrain-shadows",
          type: "hillshade",
          source: "hillshade",
          paint: {
            "hillshade-exaggeration": 0.86,
            "hillshade-shadow-color": "#07121b",
            "hillshade-highlight-color": "#f3e2bd",
            "hillshade-accent-color": "#345065",
            "hillshade-illumination-direction": 325,
          },
        },
      ],
      terrain: {
        source: "terrain",
        exaggeration: this.preview ? 1.8 : 2.2,
      },
      sky: {
        "sky-color": "#77b1d2",
        "sky-horizon-blend": 0.28,
        "horizon-color": "#d9e8eb",
        "fog-color": "#a9c5d2",
        "fog-ground-blend": 0.62,
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
    const zoom = terrainZoomForAltitude(this.focus.altitude, this.preview) + preset.zoomOffset;
    const pitch = this.preview ? preset.pitch : clamp(preset.pitch + (this.focus.pitch || 0) * 0.16, 0, 85);
    const roll = clamp((this.focus.roll || 0) * preset.rollFactor, -13, 13);

    this.map.jumpTo({
      center: [this.focus.lon, this.focus.lat],
      bearing: this.focus.heading || 0,
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
