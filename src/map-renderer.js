const TILE_SIZE = 256;
const MAX_CACHE_SIZE = 120;
const DEG_TO_RAD = Math.PI / 180;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function lonToWorldX(lon, zoom) {
  return ((lon + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

function latToWorldY(lat, zoom) {
  const safeLat = clamp(lat, -85.0511, 85.0511);
  const sin = Math.sin(safeLat * DEG_TO_RAD);
  return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * 2 ** zoom;
}

function zoomForAltitude(altitude, preview) {
  if (preview) return 11;
  const safeAltitude = Math.max(0, Number(altitude) || 0);
  return clamp(16.55 - Math.log2(1 + safeAltitude / 330), 11.05, 16.55);
}

export class MapRenderer {
  constructor(canvas, { preview = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: false });
    this.preview = preview;
    this.cache = new Map();
    this.failed = new Set();
    this.focus = { lat: 46.5197, lon: 6.6323, heading: 0, altitude: 2200 };
    this.needsRender = true;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.render(this.focus);
    });
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.needsRender = true;
    }
  }

  setFocus(lat, lon, heading = 0, altitude = 2200) {
    this.focus = { lat, lon, heading, altitude };
    this.render(this.focus);
  }

  render(focus = this.focus) {
    this.focus = { ...this.focus, ...focus };
    this.resize();
    const { width, height } = this.canvas;
    const ctx = this.context;
    if (!width || !height) return;

    const zoom = zoomForAltitude(this.focus.altitude, this.preview);
    const centerX = lonToWorldX(this.focus.lon, zoom);
    const centerY = latToWorldY(this.focus.lat, zoom);
    const heading = (this.focus.heading || 0) * DEG_TO_RAD;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawFallback(ctx, width, height, this.focus, zoom);
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-heading);

    // Limite stricte : uniquement les tuiles visibles autour du joueur, jamais de préchargement.
    const radius = Math.min(4, Math.ceil(Math.max(width, height) / TILE_SIZE / 2) + 1);
    const centerTileX = Math.floor(centerX / TILE_SIZE);
    const centerTileY = Math.floor(centerY / TILE_SIZE);
    const maxTile = 2 ** zoom;

    for (let y = centerTileY - radius; y <= centerTileY + radius; y += 1) {
      if (y < 0 || y >= maxTile) continue;
      for (let x = centerTileX - radius; x <= centerTileX + radius; x += 1) {
        const wrappedX = ((x % maxTile) + maxTile) % maxTile;
        const drawX = x * TILE_SIZE - centerX;
        const drawY = y * TILE_SIZE - centerY;
        const image = this.getTile(zoom, wrappedX, y);
        if (image?.complete && image.naturalWidth) {
          ctx.globalAlpha = 0.94;
          ctx.drawImage(image, Math.floor(drawX), Math.floor(drawY), TILE_SIZE + 1, TILE_SIZE + 1);
        }
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save();
    ctx.fillStyle = this.preview ? "rgba(2, 13, 24, 0.38)" : "rgba(3, 18, 24, 0.18)";
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
    glow.addColorStop(0, "rgba(25, 142, 173, 0.03)");
    glow.addColorStop(1, "rgba(0, 7, 13, 0.42)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawFallback(ctx, width, height, focus, zoom) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    const waterBias = (Math.sin(focus.lon * 0.19) + Math.cos(focus.lat * 0.23)) * 0.5;
    gradient.addColorStop(0, waterBias > 0.2 ? "#173d47" : "#264739");
    gradient.addColorStop(0.5, "#34543f");
    gradient.addColorStop(1, waterBias < -0.3 ? "#123b4c" : "#5a5940");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = Math.max(1, width / 1500);
    for (let i = -3; i < 12; i += 1) {
      const baseY = ((i * 97 + focus.lat * 19 + zoom * 31) % (height + 180)) - 90;
      ctx.beginPath();
      for (let x = -20; x <= width + 20; x += 24) {
        const y = baseY + Math.sin(x * 0.012 + i + focus.lon * 0.05) * (24 + (i % 3) * 9);
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = i % 3 ? "#b6cb8c" : "#9ad5d7";
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(224, 236, 207, 0.34)";
    ctx.lineWidth = Math.max(2, width / 850);
    for (let i = 0; i < 6; i += 1) {
      const x = ((i * 211 + Math.abs(focus.lon * 17)) % (width + 300)) - 150;
      ctx.beginPath();
      ctx.moveTo(x, -50);
      ctx.bezierCurveTo(x + 120, height * 0.25, x - 90, height * 0.68, x + 190, height + 50);
      ctx.stroke();
    }
    ctx.restore();
  }

  getTile(zoom, x, y) {
    const key = `${zoom}/${x}/${y}`;
    if (this.failed.has(key)) return null;
    if (this.cache.has(key)) {
      const image = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, image);
      return image;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => this.render(this.focus);
    image.onerror = () => {
      this.failed.add(key);
      this.cache.delete(key);
    };
    image.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
    this.cache.set(key, image);

    if (this.cache.size > MAX_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    return image;
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.cache.clear();
  }
}
