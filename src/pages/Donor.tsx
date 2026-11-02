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

export default function Donor() {
  return (
    <DashboardShell role="DONOR">
      <Section id="overview"        title="Overview"           desc="Your impact at a glance — meals saved, kg diverted, CO₂ avoided." />
      <Section id="donate-hub"      title="Donate to a hub"    desc="Publish sealed food to a community hub for a recipient to collect with their code." />
      <Section id="donate-delivery" title="Donate for delivery" desc="List food for a volunteer to pick up and deliver directly to a recipient." />
      <Section id="unfit-food"      title="Unfit food"         desc="Route food no longer fit for people to farms, animal shelters, or biogas plants." />
      <Section id="my-donations"    title="My donations"       desc="All your listings, remaining quantities, status, and hub handover codes." />
    </DashboardShell>
  );
}
