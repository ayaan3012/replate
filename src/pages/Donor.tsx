/**
 * Donor dashboard — placeholder
 *
 * Will use these API actions (see docs/API.md):
 *   GET  /api/data?a=profile        → donor profile (name, address, lat/lng, type)
 *   GET  /api/data?a=categories     → [{id, name}]
 *   GET  /api/data?a=tags           → [{id, name, type}]
 *   POST /api/data?a=addListing     → publish a new food listing
 *   POST /api/data?a=reportUnfit    → route food not fit for people
 *   GET  /api/data?a=myListings     → donor's listings with handover details
 *   GET  /api/data?a=myRoutings     → waste routing records
 *   GET  /api/data?a=myImpact       → meals_saved, kg_diverted, co2_avoided_kg, trust_score
 */
export default function Donor() {
  return (
    <div className="mt-8">
      <h1 className="text-2xl font-bold text-brand-ink mb-1">Donor dashboard</h1>
      <p className="text-brand-muted mb-6">
        List surplus food, track your listings, report unfit food, and see your impact.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          { label: "Post a listing",   desc: "Publish surplus food for recipients to claim." },
          { label: "Report unfit food", desc: "Route food that can't go to people to farms, shelters, or biogas." },
          { label: "My listings",       desc: "Track status, remaining quantity, and hub handovers." },
          { label: "My impact",         desc: "Meals saved, kg diverted, CO₂ avoided." },
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
