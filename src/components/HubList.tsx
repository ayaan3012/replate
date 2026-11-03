/**
 * HubList — renders hub cards for the selected/nearby hubs.
 *
 * Props:
 *   hubs          — Hub[] (from /api/hubs)
 *   selectedHubId — highlights the selected card
 *   onSelect      — called when a card is clicked
 */
import { Thermometer, Wind, Package, CheckCircle, XCircle } from "lucide-react";
import { n, type Hub } from "@/lib/api";

interface Props {
  hubs:          Hub[];
  selectedHubId: number | null;
  onSelect:      (hubId: number) => void;
}

export default function HubList({ hubs, selectedHubId, onSelect }: Props) {
  if (hubs.length === 0) {
    return (
      <p className="text-sm text-muted py-4 text-center">
        No hubs to show. Search for an address to find nearby hubs.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {hubs.map(hub => {
        const isSelected = hub.hub_id === selectedHubId;
        const isActive   = hub.status === "ACTIVE";

        // Split compartments into cold (temp_controlled=1) and ambient
        const cold    = hub.compartments.filter(c => c.temp_controlled);
        const ambient = hub.compartments.filter(c => !c.temp_controlled);

        const freeKgCold    = cold.reduce((s, c) => s + n(c.free_kg), 0);
        const freeKgAmbient = ambient.reduce((s, c) => s + n(c.free_kg), 0);
        const anyAccepting  = hub.compartments.some(c => c.accepting);

        return (
          <li key={hub.hub_id}>
            <button
              onClick={() => onSelect(hub.hub_id)}
              className={`
                w-full text-left rounded-lg border p-4
                transition-all duration-150
                ${isSelected
                  ? "border-pink bg-pink-tint shadow-glow-pink"
                  : "border-border bg-card hover:border-pink hover:bg-pink-tint/40 shadow-sm hover:shadow-md"
                }
              `}
            >
              {/* Title row */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-ink truncate">{hub.name}</p>
                  <p className="text-xs text-muted truncate">{hub.address}</p>
                </div>

                {/* Accepting badge */}
                <span
                  className={`
                    shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full
                    ${anyAccepting
                      ? "bg-success-tint text-success"
                      : "bg-error-tint text-error"}
                  `}
                >
                  {anyAccepting
                    ? <CheckCircle size={11} />
                    : <XCircle size={11} />
                  }
                  {anyAccepting ? "Accepting" : "Full"}
                </span>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-3 text-xs text-muted">
                {/* Distance */}
                {hub.distance_km !== undefined && (
                  <span className="font-medium text-ink">
                    {n(hub.distance_km).toFixed(1)} km away
                  </span>
                )}

                {/* Cold storage */}
                {cold.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Thermometer size={11} className="text-blue" />
                    Cold: <strong className="text-ink">{freeKgCold.toFixed(1)} kg</strong> free
                    ({cold.length} compartment{cold.length !== 1 ? "s" : ""})
                  </span>
                )}

                {/* Ambient */}
                {ambient.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Wind size={11} className="text-muted" />
                    Ambient: <strong className="text-ink">{freeKgAmbient.toFixed(1)} kg</strong> free
                    ({ambient.length} compartment{ambient.length !== 1 ? "s" : ""})
                  </span>
                )}

                {/* Available items */}
                {hub.available_items > 0 && (
                  <span className="flex items-center gap-1">
                    <Package size={11} className="text-pink" />
                    <strong className="text-ink">{hub.available_items}</strong> item{hub.available_items !== 1 ? "s" : ""} available
                  </span>
                )}

                {/* Hub status (inactive) */}
                {!isActive && (
                  <span className="text-error font-medium">{hub.status}</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
