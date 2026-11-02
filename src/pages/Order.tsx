/**
 * Recipient / Order page — placeholder
 *
 * Will use these API actions (see docs/API.md):
 *   GET  /api/data?a=profile            → org name, address, cold-storage flag
 *   GET  /api/data?a=feed[&hub_id=]     → active listings filtered by dietary needs + cold storage
 *   POST /api/data?a=claim              → claim a listing {listing_id, qty}
 *   GET  /api/data?a=myClaims           → claims with handover codes and pickup status
 *   GET  /api/data?a=myImpact           → claims_completed, kg_received, meals_received
 *   GET  /api/hubs?a=list               → all hubs (for hub filter)
 */
export default function Order() {
  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold text-brand-ink mb-1">Order food</h1>
      <p className="text-brand-muted mb-6">
        Browse available surplus food and claim what your organisation needs.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "Food feed",    desc: "Listings matched to your dietary requirements, sorted by score." },
          { label: "My orders",    desc: "Track claim status, volunteer assignments, and pickup codes." },
          { label: "Hub filter",   desc: "Show only food available at a specific community hub." },
          { label: "My impact",    desc: "Completed claims, total kg received, and meals served." },
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
