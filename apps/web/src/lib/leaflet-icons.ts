import L from "leaflet";

// Ensure marker assets are bundled and resolved correctly in both dev and prod.
const markerIconUrl = new URL(
  "leaflet/dist/images/marker-icon.png",
  import.meta.url,
).toString();
const markerIconRetinaUrl = new URL(
  "leaflet/dist/images/marker-icon-2x.png",
  import.meta.url,
).toString();
const markerShadowUrl = new URL(
  "leaflet/dist/images/marker-shadow.png",
  import.meta.url,
).toString();

let configured = false;

export function setupLeafletDefaultIcons() {
  // Idempotent: safe to call from every Leaflet-using component on mount.
  if (configured) return;
  configured = true;
  const defaultIcon = L.icon({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerIconRetinaUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41],
  });

  // Apply to every marker by default (avoids Leaflet imagePath concatenation).
  L.Marker.prototype.options.icon = defaultIcon;
}
