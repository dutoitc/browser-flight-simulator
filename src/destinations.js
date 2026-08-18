export const DESTINATIONS = [
  { id: "lausanne", city: "Lausanne", country: "Suisse", lat: 46.5197, lon: 6.6323, heading: 42, visits: "Local", accent: "#25d6f5" },
  { id: "dubai", city: "Dubai", country: "Émirats arabes unis", lat: 25.2048, lon: 55.2708, heading: 305, visits: "1 240 vols", accent: "#f5bd4c" },
  { id: "new-york", city: "New York", country: "États-Unis", lat: 40.7128, lon: -74.006, heading: 115, visits: "980 vols", accent: "#2ef0bb" },
  { id: "tokyo", city: "Tokyo", country: "Japon", lat: 35.6762, lon: 139.6503, heading: 210, visits: "824 vols", accent: "#ff7185" },
  { id: "reykjavik", city: "Reykjavík", country: "Islande", lat: 64.1466, lon: -21.9426, heading: 75, visits: "712 vols", accent: "#9d8cff" },
  { id: "cape-town", city: "Le Cap", country: "Afrique du Sud", lat: -33.9249, lon: 18.4241, heading: 330, visits: "660 vols", accent: "#ff9867" },
  { id: "queenstown", city: "Queenstown", country: "Nouvelle-Zélande", lat: -45.0312, lon: 168.6626, heading: 44, visits: "598 vols", accent: "#47d2a5" },
  { id: "rio", city: "Rio de Janeiro", country: "Brésil", lat: -22.9068, lon: -43.1729, heading: 90, visits: "575 vols", accent: "#ffd44d" },
  { id: "paris", city: "Paris", country: "France", lat: 48.8566, lon: 2.3522, heading: 270, visits: "552 vols", accent: "#45a9ff" },
  { id: "barcelona", city: "Barcelone", country: "Espagne", lat: 41.3874, lon: 2.1686, heading: 155, visits: "519 vols", accent: "#fa746e" },
  { id: "seattle", city: "Seattle", country: "États-Unis", lat: 47.6062, lon: -122.3321, heading: 10, visits: "486 vols", accent: "#68d391" },
  { id: "sydney", city: "Sydney", country: "Australie", lat: -33.8688, lon: 151.2093, heading: 25, visits: "441 vols", accent: "#33c7f0" },
];

const fold = (value) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

export function searchDestinations(query) {
  const normalized = fold(query.trim());
  if (!normalized) return DESTINATIONS.slice(0, 6);

  return DESTINATIONS.filter((destination) =>
    fold(`${destination.city} ${destination.country}`).includes(normalized),
  ).slice(0, 8);
}

export function parseCoordinates(query) {
  const match = query
    .trim()
    .replace(/[°]/g, "")
    .match(/^\s*(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);

  if (!match) return null;
  const lat = Number(match[1].replace(",", "."));
  const lon = Number(match[2].replace(",", "."));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
    return null;
  }

  return {
    id: `coords-${lat.toFixed(4)}-${lon.toFixed(4)}`,
    city: "Point personnalisé",
    country: `${formatCoordinate(lat, "N", "S")} · ${formatCoordinate(lon, "E", "O")}`,
    lat,
    lon,
    heading: 0,
    visits: "Coordonnées",
    accent: "#25d6f5",
  };
}

export function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`;
}

export function formatCoordinates(lat, lon) {
  return `${formatCoordinate(lat, "N", "S")} · ${formatCoordinate(lon, "E", "O")}`;
}
