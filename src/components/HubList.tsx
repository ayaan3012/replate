/**
 * HubList — renders hub cards for the selected/nearby hubs.
 *
 * Props:
 *   hubs          — Hub[] (from /api/hubs)
 *   selectedHubId — highlights the selected card
 *   onSelect      — called when a card is clicked
 */
import { Thermometer, Wind, Package, CheckCircle, XCircle, AlertCircle, Trash2 } from "lucide-react";
import { n, type Hub } from "@/lib/api";

// ─── 3-state accepting badge helper ──────────────────────────────────────────
// accepting=1 AND at least one compartment has free_kg > 0  → green "Accepting"
// accepting=1 AND every compartment has free_kg = 0         → red   "Full"
// accepting=0                                               → amber "Not accepting…"
export function hubAcceptingState(hub: Hub): "accepting" | "full" | "not-accepting" {
  const anyAccepting = hub.compartments.some(c => c.accepting);
  if (!anyAccepting) return "not-accepting";
  const anyFree = hub.compartments.some(c => n(c.free_kg) > 0);
  return anyFree ? "accepting" : "full";
}

// Compartment-level 3-state (same rules applied to a single compartment)
export function compartmentAcceptingState(c: { accepting: number; free_kg: string | number }): "accepting" | "full" | "not-accepting" {
  if (!c.accepting) return "not-accepting";
  return n(c.free_kg) > 0 ? "accepting" : "full";
}

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
        const acceptState   = hubAcceptingState(hub);

        // Format last check-in time
        const lastCheckin = hub.last_checkin
          ? new Date(hub.last_checkin).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
          : null;

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

                {/* 3-state accepting badge */}
                {acceptState === "accepting" && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-success-tint text-success">
                    <CheckCircle size={11} />
                    Accepting
                  </span>
                )}
                {acceptState === "full" && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-error-tint text-error">
                    <XCircle size={11} />
                    Full
                  </span>
                )}
                {acceptState === "not-accepting" && (
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(217,119,6,.12)", color: "#b45309" }}>
                      <AlertCircle size={11} />
                      Not accepting
                    </span>
                    {lastCheckin && (
                      <span className="text-[10px] text-muted">Steward check-in needed · Last: {lastCheckin}</span>
                    )}
                    {!lastCheckin && (
                      <span className="text-[10px] text-muted">Steward check-in needed</span>
                    )}
                  </div>
                )}
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

                {/* Waste bins */}
                {hub.bins && hub.bins.length > 0 && (
                  <span className="flex items-center gap-1">
                    <Trash2 size={11} className="text-muted" />
                    {hub.bins.length} waste bin{hub.bins.length !== 1 ? "s" : ""}
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
