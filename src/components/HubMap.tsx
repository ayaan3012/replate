/**
 * HubMap — Leaflet map of community hubs.
 *
 * Props:
 *   hubs          — from /api/hubs?a=list
 *   userLocation  — {lat,lng} or null
 *   selectedHubId — currently selected hub_id (or null)
 *   onSelect      — called with hub_id when a pin is clicked
 *
 * Fixes Leaflet's broken default icon URLs under Vite by overriding them
 * with the CDN copies that are already linked from index.html.
 */
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { n, type Hub } from "@/lib/api";

// ─── Vite icon fix ────────────────────────────────────────────────────────────
// Leaflet bundles icon images that Vite's bundler moves to a hashed path.
// Override them to point at the same CDN Leaflet CSS we load in index.html.
const CDN = "https://unpkg.com/leaflet@1.9.4/dist/images";

const makeIcon = (color: "pink" | "blue" | "grey") => {
  const hue: Record<string, string> = {
    pink:  "hue-rotate(300deg) saturate(4)",
    blue:  "hue-rotate(210deg) saturate(3)",
    grey:  "grayscale(1) opacity(0.55)",
  };
  return L.divIcon({
    className: "",
    html: `<div style="
      width:24px; height:36px;
      background: url('${CDN}/marker-icon-2x.png') no-repeat top/contain;
      filter: ${hue[color]};
    "></div>`,
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
};

const ICON_ACTIVE   = makeIcon("pink");
const ICON_INACTIVE = makeIcon("grey");
const ICON_USER     = makeIcon("blue");

// ─── Auto-fit helper ─────────────────────────────────────────────────────────
interface FitProps {
  points: [number, number][];
}
function FitBounds({ points }: FitProps) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
  }, [map, points]);
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  hubs:          Hub[];
  userLocation:  { lat: number; lng: number } | null;
  selectedHubId: number | null;
  onSelect:      (hubId: number) => void;
}

export default function HubMap({ hubs, userLocation, selectedHubId, onSelect }: Props) {
  // Collect all points for fitBounds
  const points: [number, number][] = hubs
    .map(h => [n(h.latitude), n(h.longitude)] as [number, number])
    .filter(([lat, lng]) => lat !== 0 || lng !== 0);

  if (userLocation) {
    points.push([userLocation.lat, userLocation.lng]);
  }

  // Default centre: Delhi
  const centre: [number, number] = points.length > 0 ? points[0] : [28.6139, 77.209];

  return (
    <MapContainer
      center={centre}
      zoom={11}
      style={{ height: "100%", width: "100%", borderRadius: "var(--radius-lg)" }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <FitBounds points={points} />

      {/* Hub pins */}
      {hubs.map(hub => {
        const lat = n(hub.latitude);
        const lng = n(hub.longitude);
        if (lat === 0 && lng === 0) return null;

        const isActive   = hub.status === "ACTIVE";
        const isSelected = hub.hub_id === selectedHubId;
        const icon = isActive ? ICON_ACTIVE : ICON_INACTIVE;

        return (
          <Marker
            key={hub.hub_id}
            position={[lat, lng]}
            icon={icon}
            eventHandlers={{ click: () => onSelect(hub.hub_id) }}
            zIndexOffset={isSelected ? 1000 : 0}
          >
            <Popup>
              <strong>{hub.name}</strong>
              <br />
              {hub.address}
              <br />
              <span style={{ fontSize: 12, color: isActive ? "green" : "grey" }}>
                {hub.status}
              </span>
              {hub.available_items > 0 && (
                <><br />{hub.available_items} item{hub.available_items !== 1 ? "s" : ""} available</>
              )}
            </Popup>
          </Marker>
        );
      })}

      {/* User location pin */}
      {userLocation && (
        <Marker
          position={[userLocation.lat, userLocation.lng]}
          icon={ICON_USER}
        >
          <Popup>Your location</Popup>
        </Marker>
      )}
    </MapContainer>
  );
}
