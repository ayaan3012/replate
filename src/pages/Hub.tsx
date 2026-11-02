/**
 * Hub map page — placeholder
 *
 * Will use these API actions (see docs/API.md):
 *   GET  /api/hubs?a=list              → all hubs with compartments; optional ?lat=&lng= for distance
 *   GET  /api/hubs?a=nearest?lat=&lng= → 3 closest ACTIVE hubs
 *   POST /api/hubs?a=checkin           → steward temperature check-in {hub_id, temp}
 *   POST /api/hubs?a=kiosk             → drop/collect code verification {handover_id, code}
 *
 * The map will be rendered with react-leaflet (already installed).
 * Hub markers will use lat/lng from v_hub_status.
 */
export default function Hub() {
  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold text-ink mb-1">Community hubs</h1>
      <p className="text-muted mb-6">
        Cold-chain drop points where donors leave sealed food for recipients to collect.
      </p>

      {/* Map placeholder — will become a react-leaflet MapContainer */}
      <div className="rounded-2xl border border-border overflow-hidden bg-bluex h-72 flex items-center justify-center">
        <span className="text-muted text-sm">Map will load here (react-leaflet)</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {[
          { label: "Hub list",       desc: "All active hubs with compartment status and available items." },
          { label: "Nearest hubs",   desc: "3 closest hubs to your current location." },
          { label: "Steward check-in", desc: "Log a temperature reading for your hub." },
          { label: "Kiosk",          desc: "Enter drop or pickup codes to unlock a compartment." },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-border bg-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-ink mb-1">{item.label}</h2>
            <p className="text-sm text-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
