/**
 * AddressSearch — geocodes an address and returns the 3 nearest hubs.
 *
 * Props:
 *   onResult(hubs, coords) — called on success
 *
 * Calls:
 *   GET /api/geo?a=geocode&q=<address>   → { lat, lng }
 *   GET /api/hubs?a=nearest&lat=&lng=    → Hub[]
 */
import { useState, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";
import type { Hub } from "@/lib/api";

interface GeoResult  { lat: number; lng: number }

interface Props {
  onResult: (hubs: Hub[], coords: GeoResult) => void;
  /** Optional initial value for the address input */
  prefill?: string;
}

export default function AddressSearch({ onResult, prefill }: Props) {
  const [query,  setQuery]  = useState(prefill ?? "");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  // Sync when prefill arrives after async profile load
  useEffect(() => {
    if (prefill && !query) setQuery(prefill);
  }, [prefill]);

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);

    try {
      // Step 1 — geocode
      const geoRes = await fetch(`/api/geo?a=geocode&q=${encodeURIComponent(q)}`, {
        credentials: "include",
      });
      if (geoRes.status === 404) {
        setError("Address not found");
        return;
      }
      if (!geoRes.ok) throw new Error(`Geocode error ${geoRes.status}`);
      const geo: GeoResult = await geoRes.json();

      // Step 2 — nearest hubs
      const hubRes = await fetch(
        `/api/hubs?a=nearest&lat=${geo.lat}&lng=${geo.lng}`,
        { credentials: "include" },
      );
      if (!hubRes.ok) throw new Error(`Hubs error ${hubRes.status}`);
      const hubs: Hub[] = await hubRes.json();

      onResult(hubs, geo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MapPin
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") search(); }}
            placeholder="Enter an address…"
            className="
              w-full pl-8 pr-3 py-2 rounded border border-border bg-white
              text-sm text-ink placeholder:text-muted
              focus:outline-none focus:border-pink focus:shadow-glow-pink
              transition-shadow
            "
          />
        </div>
        <button
          onClick={search}
          disabled={busy || !query.trim()}
          className="
            flex items-center gap-1.5 px-4 py-2 rounded
            bg-pink text-white text-sm font-semibold
            shadow-glow-pink hover:brightness-110
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all
          "
        >
          {busy
            ? <Loader2 size={14} className="animate-spin" />
            : <MapPin size={14} />
          }
          {busy ? "Searching…" : "Find closest hubs"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-error" role="alert">{error}</p>
      )}
    </div>
  );
}
