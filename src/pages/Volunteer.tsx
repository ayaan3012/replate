import DashboardShell from "@/components/DashboardShell";

function Section({ id, title, desc }: { id: string; title: string; desc: string }) {
  return (
    <section id={id} className="scroll-mt-6 mb-10">
      <h2 className="text-lg font-bold text-ink mb-1">{title}</h2>
      <p className="text-sm text-muted mb-4">{desc}</p>
      <div className="rounded-lg border border-border bg-white p-6 shadow-sm min-h-[120px] flex items-center justify-center">
        <span className="text-sm text-muted">Coming soon</span>
      </div>
    </section>
  );
}

export default function Volunteer() {
  return (
    <DashboardShell role="VOLUNTEER">
      <Section id="food-deliveries" title="Food deliveries" desc="Open claims near you with available slots, sorted by distance from your home location." />
      <Section id="waste-runs"      title="Waste runs"      desc="Pending waste routings ready for collection, grouped by partner." />
      <Section id="my-history"      title="My history"      desc="Completed pickups, collections, kg delivered, and meals helped." />
    </DashboardShell>
  );
}
