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

export default function Order() {
  return (
    <DashboardShell role="RECIPIENT">
      <Section id="find-food" title="Find food"  desc="Listings matched to your dietary requirements, sorted by match score." />
      <Section id="hubs-map"  title="Hubs map"   desc="Find a community hub near you and filter listings by hub." />
      <Section id="my-orders" title="My orders"  desc="Claims with handover codes, pickup status, and volunteer assignments." />
    </DashboardShell>
  );
}
