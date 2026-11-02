/**
 * Volunteer dashboard — placeholder
 *
 * Will use these API actions (see docs/API.md):
 *   GET  /api/data?a=profile        → name, lat/lng, vehicle_type, vrole, service_radius_km
 *   — Food deliveries (FOOD_ONLY or DUAL) —
 *   GET  /api/data?a=jobs           → claims with eligible slots and distance_km
 *   POST /api/data?a=accept         → {claim_id, slot_id}
 *   POST /api/data?a=setStatus      → {pickup_id, status, failure_reason?}
 *   GET  /api/data?a=myPickups      → pickup list with slot times and delivered_at
 *   — Waste runs (WASTE_ONLY or DUAL) —
 *   GET  /api/data?a=wasteJobs      → pending WASTE_ROUTING rows
 *   GET  /api/data?a=wasteSlots     → available WASTE delivery slots
 *   GET  /api/data?a=containers     → waste containers
 *   POST /api/data?a=collect        → {waste_ids, slot_id, container_id, vehicle_no, weighed_kg}
 *   GET  /api/data?a=myCollections  → past collection runs
 *   — Impact —
 *   GET  /api/data?a=myImpact       → deliveries_completed, kg_delivered, waste_kg_collected
 */
export default function Volunteer() {
  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold text-brand-ink mb-1">Volunteer dashboard</h1>
      <p className="text-brand-muted mb-6">
        Pick up food deliveries or run waste collections — depending on your role.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "Food delivery jobs", desc: "Open claims near you with available slots, sorted by distance." },
          { label: "My pickups",          desc: "Track status: Accepted → In Transit → Delivered." },
          { label: "Waste runs",          desc: "Pending waste routings grouped by partner." },
          { label: "My impact",           desc: "Deliveries completed, kg delivered, waste collected." },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-brand-line bg-brand-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-brand-ink mb-1">{item.label}</h2>
            <p className="text-sm text-brand-muted">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
