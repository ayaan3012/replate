/**
 * /volunteer — full volunteer dashboard
 *
 * Tabs depend on vrole (FOOD_ONLY → Food deliveries; WASTE_ONLY → Waste runs;
 * DUAL → both), plus "My history" always shown.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Utensils, Leaf, Wind, Check, ChevronDown, Loader2, AlertCircle,
  MapPin, Truck, Trash2, Package, ClipboardList,
} from "lucide-react";
import {
  call, n, type VolunteerProfile, type VolunteerImpact,
  type Job, type Pickup, type WasteJob, type WasteSlot,
  type Container, type CollectResponse, type Collection,
} from "@/lib/api";
import { useToast }      from "@/context/ToastContext";
import DashboardShell    from "@/components/DashboardShell";

// ─── shared primitives ────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-muted">
      <AlertCircle size={28} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DELIVERED:   "bg-success-tint text-success",
    IN_TRANSIT:  "bg-blue-tint text-blue",
    ACCEPTED:    "bg-pink-tint text-pink",
    FAILED:      "bg-error-tint text-error",
    COMPLETED:   "bg-success-tint text-success",
    PENDING:     "bg-border text-muted",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${map[status] ?? "bg-border text-muted"}`}>
      {status}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "food" | "waste" | "history";

const FOOD_STEPS  = ["Accepted", "In transit", "Delivered"];
const FAIL_REASONS = [
  { value: "FOOD_UNSAFE",         label: "Food not safe" },
  { value: "RECIPIENT_UNAVAILABLE", label: "Recipient unavailable" },
  { value: "VEHICLE_BREAKDOWN",   label: "Vehicle breakdown" },
  { value: "OTHER",               label: "Other" },
];

// ─── Stepper ──────────────────────────────────────────────────────────────────

function MiniStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              i < current ? "bg-success text-white"
              : i === current ? "bg-pink text-white"
              : "bg-border text-muted"
            }`}>
              {i < current ? <Check size={11} /> : i + 1}
            </div>
            <span className="text-[10px] text-muted mt-0.5 text-center leading-tight">{label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-1 mb-3 ${i < current ? "bg-success" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section wrap ─────────────────────────────────────────────────────────────

function SectionWrap({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">{title}</h2>
      {children}
    </section>
  );
}

// ─── Food deliveries section ─────────────────────────────────────────────────

function FoodDeliveriesSection({ onRefresh }: { onRefresh: () => void }) {
  const [jobs,      setJobs]      = useState<Job[]>([]);
  const [pickups,   setPickups]   = useState<Pickup[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [busy,      setBusy]      = useState<number | null>(null);
  const [slotSel,   setSlotSel]   = useState<Record<number, number>>({});
  const [failOpen,  setFailOpen]  = useState<number | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      call<Job[]>("data", "jobs").catch(() => []),
      call<Pickup[]>("data", "myPickups").catch(() => []),
    ])
    .then(([j, p]) => { setJobs(j ?? []); setPickups(p ?? []); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load jobs"))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAccept = async (job: Job) => {
    const slotId = slotSel[job.claim_id] ?? job.slots[0]?.slot_id;
    if (!slotId) { toast("No slot available for this job"); return; }
    setBusy(job.claim_id);
    try {
      await call("data", "accept", { claim_id: job.claim_id, slot_id: slotId });
      toast("Job accepted!", "success");
      load();
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not accept job");
    } finally {
      setBusy(null);
    }
  };

  const handleStatus = async (pickupId: number, status: string, reason?: string) => {
    try {
      await call("data", "setStatus", { pickup_id: pickupId, status, failure_reason: reason });
      toast("Status updated", "success");
      load();
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update status");
    }
    setFailOpen(null);
  };

  // Active pickups (not delivered / not failed)
  const active = pickups.filter(p =>
    p.pickup_status !== "DELIVERED" && p.pickup_status !== "FAILED"
  );
  const availableJobs = jobs.filter(j =>
    !pickups.some(p => /* same claim already accepted */ false)
  );

  return (
    <SectionWrap id="food-deliveries" title="Food deliveries">
      {/* Active pickups with stepper */}
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl mb-4" />
      ) : active.length > 0 ? (
        <div className="flex flex-col gap-4 mb-6">
          {active.map(p => {
            const stepIdx = p.pickup_status === "IN_TRANSIT" ? 1 : 0;
            return (
              <div key={p.pickup_id} className="rounded-xl border-2 border-pink bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-bold text-sm text-ink">{p.food_name} × {p.quantity_claimed}</p>
                    <p className="text-xs text-muted mt-0.5">
                      <MapPin size={10} className="inline mr-0.5" />
                      From {p.pickup_from} → To {p.deliver_to}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      <Truck size={10} className="inline mr-0.5" />
                      Slot: {p.slot_date?.toString().slice(0,10)} {p.start_time}
                    </p>
                  </div>
                  <StatusBadge status={p.pickup_status} />
                </div>

                <MiniStepper steps={FOOD_STEPS} current={stepIdx} />

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4">
                  {p.pickup_status === "ACCEPTED" && (
                    <button
                      onClick={() => handleStatus(p.pickup_id, "IN_TRANSIT")}
                      className="px-4 py-2 rounded-lg bg-blue text-white text-xs font-bold hover:brightness-110 transition-all"
                    >
                      Start delivery
                    </button>
                  )}
                  {p.pickup_status === "IN_TRANSIT" && (
                    <button
                      onClick={() => handleStatus(p.pickup_id, "DELIVERED")}
                      className="px-4 py-2 rounded-lg bg-success text-white text-xs font-bold hover:brightness-110 transition-all"
                    >
                      Mark delivered
                    </button>
                  )}

                  {/* Report a problem dropdown */}
                  <div className="relative ml-auto">
                    <button
                      onClick={() => setFailOpen(failOpen === p.pickup_id ? null : p.pickup_id)}
                      className="px-3 py-2 rounded-lg border border-error text-error text-xs font-semibold hover:bg-error-tint transition-colors"
                    >
                      Report a problem
                      <ChevronDown size={11} className="inline ml-1" />
                    </button>
                    {failOpen === p.pickup_id && (
                      <div className="absolute right-0 top-full mt-1 w-56 rounded-lg border border-border bg-white shadow-lg z-20 py-1">
                        {FAIL_REASONS.map(r => (
                          <button
                            key={r.value}
                            onClick={() => handleStatus(p.pickup_id, "FAILED", r.value)}
                            className="w-full text-left px-3 py-2 text-xs text-ink hover:bg-error-tint transition-colors"
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Available jobs */}
      <p className="text-sm font-semibold text-ink mb-3">Available jobs</p>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : availableJobs.length === 0 ? (
        <EmptyState message="No delivery jobs available right now." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {availableJobs.map(job => (
            <div key={job.claim_id} className="rounded-xl border border-border bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
              <p className="font-bold text-sm text-ink mb-1">{job.food_name} × {job.quantity_claimed}</p>
              <p className="text-xs text-muted mb-2">
                <MapPin size={10} className="inline mr-0.5" />
                From {job.pickup_from} → To {job.deliver_to}
              </p>
              <div className="flex items-center gap-2 mb-3 text-xs">
                <span className="font-medium text-ink">{n(job.distance_km).toFixed(1)} km</span>
                {!job.within_radius && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-error-tint text-error">
                    Outside your radius
                  </span>
                )}
              </div>

              {/* Slot dropdown */}
              {job.slots.length > 0 ? (
                <div className="flex items-center gap-2 mb-3">
                  <select
                    value={slotSel[job.claim_id] ?? job.slots[0].slot_id}
                    onChange={e => setSlotSel(s => ({ ...s, [job.claim_id]: Number(e.target.value) }))}
                    className="flex-1 px-2 py-1.5 rounded border border-border bg-white text-xs text-ink focus:outline-none focus:border-pink"
                  >
                    {job.slots.map(s => (
                      <option key={s.slot_id} value={s.slot_id}>
                        {s.slot_date.toString().slice(0,10)} {s.start_time}–{s.end_time}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleAccept(job)}
                    disabled={busy === job.claim_id}
                    className="px-4 py-1.5 rounded-lg bg-pink text-white text-xs font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
                  >
                    {busy === job.claim_id ? <Loader2 size={12} className="inline animate-spin" /> : "Accept"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-muted">No free slots for this job.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionWrap>
  );
}

// ─── Waste runs section ────────────────────────────────────────────────────────

const ROUTE_BADGE: Record<string, string> = {
  ANIMAL_SHELTER: "bg-pink-tint text-pink",
  FARM:          "bg-success-tint text-success",
  BIOGAS:        "bg-blue-tint text-blue",
  COMPOST:       "bg-border text-muted",
};

function WasteRunsSection({ onRefresh }: { onRefresh: () => void }) {
  const [jobs,       setJobs]       = useState<WasteJob[]>([]);
  const [slots,      setSlots]     = useState<WasteSlot[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [checked,    setChecked]    = useState<Set<number>>(new Set());
  const [form,       setForm]       = useState({ slot_id: 0, container_id: 0, vehicle_no: "", weighed_kg: "" });
  const [busy,       setBusy]       = useState(false);
  const [receipt,    setReceipt]    = useState<CollectResponse | null>(null);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([
      call<WasteJob[]>("data", "wasteJobs").catch(() => []),
      call<WasteSlot[]>("data", "wasteSlots").catch(() => []),
      call<Container[]>("data", "containers").catch(() => []),
    ])
    .then(([j, s, c]) => { setJobs(j ?? []); setSlots(s ?? []); setContainers(c ?? []); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load waste jobs"))
    .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Group jobs by partner
  const byPartner = new Map<number, { name: string; address: string; route_type: string; items: WasteJob[] }>();
  jobs.forEach(j => {
    let p = byPartner.get(j.partner_id);
    if (!p) { p = { name: j.partner_name, address: j.partner_address, route_type: j.route_type, items: [] }; byPartner.set(j.partner_id, p); }
    p.items.push(j);
  });

  // Which partner are we collecting for?
  const checkedJobs = jobs.filter(j => checked.has(j.waste_id));
  const checkedPartners = new Set(checkedJobs.map(j => j.partner_id));
  const activePartnerId = checkedPartners.size === 1 ? [...checkedPartners][0] : null;

  const toggle = (id: number) => {
    setChecked(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  const handleCollect = async () => {
    if (!activePartnerId) { toast("Select routings for one partner only"); return; }
    if (!form.slot_id || !form.container_id || !form.vehicle_no || !form.weighed_kg) {
      toast("Fill in slot, container, vehicle and weight");
      return;
    }
    setBusy(true);
    try {
      const res = await call<CollectResponse>("data", "collect", {
        waste_ids: [...checked],
        slot_id: form.slot_id,
        container_id: form.container_id,
        vehicle_no: form.vehicle_no,
        weighed_kg: Number(form.weighed_kg),
      });
      setReceipt(res);
      setChecked(new Set());
      setForm({ slot_id: 0, container_id: 0, vehicle_no: "", weighed_kg: "" });
      load();
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not collect waste");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Skeleton className="h-60 w-full rounded-xl" />;

  if (receipt) {
    return (
      <SectionWrap id="waste-runs" title="Waste runs">
        <div className="max-w-md rounded-xl border-2 border-success bg-success-tint p-6">
          <div className="flex items-center gap-2 mb-3">
            <Check size={20} className="text-success" />
            <p className="font-bold text-success">Collection recorded!</p>
          </div>
          <p className="text-sm text-ink mb-1">Receipt: <strong className="font-mono">{receipt.receipt_ref}</strong></p>
          <p className="text-sm text-muted">Collection ID: {receipt.collection_id}</p>
          <button
            onClick={() => setReceipt(null)}
            className="mt-4 w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold"
          >
            Done
          </button>
        </div>
      </SectionWrap>
    );
  }

  if (jobs.length === 0) return (
    <SectionWrap id="waste-runs" title="Waste runs">
      <EmptyState message="No waste routings pending right now." />
    </SectionWrap>
  );

  return (
    <SectionWrap id="waste-runs" title="Waste runs">
      <div className="flex flex-col gap-5">
        {Array.from(byPartner.entries()).map(([pid, p]) => (
          <div key={pid} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            {/* Partner header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROUTE_BADGE[p.route_type] ?? "bg-border text-muted"}`}>
                {p.route_type.replace(/_/g, " ")}
              </span>
              <div className="min-w-0">
                <p className="font-bold text-sm text-ink truncate">{p.name}</p>
                <p className="text-xs text-muted truncate">{p.address}</p>
              </div>
            </div>

            {/* Routing checkboxes */}
            <ul className="flex flex-col gap-1.5 mb-3">
              {p.items.map(j => (
                <li key={j.waste_id}>
                  <label className="flex items-center gap-2 cursor-pointer text-sm text-ink py-1">
                    <input
                      type="checkbox"
                      checked={checked.has(j.waste_id)}
                      onChange={() => toggle(j.waste_id)}
                      className="w-4 h-4 accent-[var(--color-pink)]"
                    />
                    <span className="flex-1">{j.food_name}</span>
                    <span className="text-xs text-muted">{n(j.quantity_kg).toFixed(1)} kg · {j.condition_grade.replace(/_/g," ")}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Collection form — only when one partner's items are checked */}
      {activePartnerId && (
        <div className="mt-4 rounded-xl border-2 border-pink bg-pink-tint/30 p-5">
          <p className="font-semibold text-sm text-ink mb-4">Collect {checked.size} routing(s) from {byPartner.get(activePartnerId)?.name}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Slot
              <select value={form.slot_id} onChange={e => setForm(f => ({ ...f, slot_id: Number(e.target.value) }))} className="px-2 py-2 rounded border border-border bg-white text-sm focus:outline-none focus:border-pink">
                <option value={0}>Choose…</option>
                {slots.map(s => <option key={s.slot_id} value={s.slot_id}>{s.slot_date.toString().slice(0,10)} {s.start_time}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Container
              <select value={form.container_id} onChange={e => setForm(f => ({ ...f, container_id: Number(e.target.value) }))} className="px-2 py-2 rounded border border-border bg-white text-sm focus:outline-none focus:border-pink">
                <option value={0}>Choose…</option>
                {containers.map(c => <option key={c.container_id} value={c.container_id}>{c.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Vehicle number
              <input value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))} placeholder="DL01AB1234" className="px-2 py-2 rounded border border-border bg-white text-sm focus:outline-none focus:border-pink" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
              Weighed (kg)
              <input type="number" step="0.1" min="0" value={form.weighed_kg} onChange={e => setForm(f => ({ ...f, weighed_kg: e.target.value }))} placeholder="42.5" className="px-2 py-2 rounded border border-border bg-white text-sm focus:outline-none focus:border-pink" />
            </label>
          </div>
          <button
            onClick={handleCollect}
            disabled={busy}
            className="mt-4 w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {busy ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
            {busy ? "Recording…" : "Collect"}
          </button>
        </div>
      )}
    </SectionWrap>
  );
}

// ─── History section ──────────────────────────────────────────────────────────

function HistorySection() {
  const [pickups,     setPickups]     = useState<Pickup[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [impact,      setImpact]     = useState<VolunteerImpact | null>(null);
  const [loading,     setLoading]    = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([
      call<Pickup[]>("data", "myPickups").catch(() => []),
      call<Collection[]>("data", "myCollections").catch(() => []),
      call<VolunteerImpact>("data", "myImpact").catch(() => null),
    ])
    .then(([p, c, imp]) => { setPickups(p ?? []); setCollections(c ?? []); setImpact(imp); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load history"))
    .finally(() => setLoading(false));
  }, []);

  const stats = impact ? [
    { label: "Deliveries",     value: impact.deliveries_completed },
    { label: "Kg delivered",   value: n(impact.kg_delivered).toFixed(1) },
    { label: "Meals delivered", value: n(impact.meals_delivered).toFixed(0) },
    { label: "Waste collected", value: `${n(impact.waste_kg_collected).toFixed(1)} kg` },
  ] : [];

  return (
    <SectionWrap id="my-history" title="My history">
      {/* Stat cards */}
      {impact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {stats.map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-white p-4 shadow-sm text-center">
              <p className="text-lg font-bold text-ink">{s.value}</p>
              <p className="text-xs text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Pickups table */}
      <p className="text-sm font-semibold text-ink mb-2">Food deliveries</p>
      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl mb-6" />
      ) : pickups.length === 0 ? (
        <EmptyState message="No deliveries yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border mb-6">
          <table className="w-full text-sm">
            <thead><tr className="bg-blue-tint text-left">
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Food</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">From</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">To</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Status</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Delivered</th>
            </tr></thead>
            <tbody>
              {pickups.map(p => (
                <tr key={p.pickup_id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-ink">{p.food_name}</td>
                  <td className="px-4 py-3 text-muted text-xs">{p.pickup_from}</td>
                  <td className="px-4 py-3 text-muted text-xs">{p.deliver_to}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.pickup_status} /></td>
                  <td className="px-4 py-3 text-muted text-xs">{p.delivered_at ? new Date(p.delivered_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collections table */}
      <p className="text-sm font-semibold text-ink mb-2">Waste collections</p>
      {loading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : collections.length === 0 ? (
        <EmptyState message="No collections yet." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead><tr className="bg-blue-tint text-left">
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Partner</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Kg</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Receipt</th>
              <th className="px-4 py-2.5 font-semibold text-blue text-xs">Collected</th>
            </tr></thead>
            <tbody>
              {collections.map(c => (
                <tr key={c.collection_id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-ink">{c.partner_name}</td>
                  <td className="px-4 py-3 text-muted">{n(c.weighed_kg).toFixed(1)}</td>
                  <td className="px-4 py-3 text-muted font-mono text-xs">{c.receipt_ref}</td>
                  <td className="px-4 py-3 text-muted text-xs">{new Date(c.collected_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionWrap>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Volunteer() {
  const { toast } = useToast();
  const [profile, setProfile] = useState<VolunteerProfile | null>(null);
  const [tab,     setTab]     = useState<Tab | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [, forceTick] = useState(0);

  useEffect(() => {
    call<VolunteerProfile>("data", "profile")
      .then(p => {
        setProfile(p);
        // Determine which tabs to show
        if (p.vrole === "FOOD_ONLY") setTab("food");
        else if (p.vrole === "WASTE_ONLY") setTab("waste");
        else setTab("food"); // DUAL defaults to food
      })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load profile"));
  }, []);

  const onRefresh = () => setRefreshKey(k => k + 1);

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "food",    label: "Food deliveries", show: profile?.vrole === "FOOD_ONLY" || profile?.vrole === "DUAL" },
    { id: "waste",   label: "Waste runs",      show: profile?.vrole === "WASTE_ONLY" || profile?.vrole === "DUAL" },
    { id: "history", label: "My history",      show: true },
  ];

  return (
    <DashboardShell role="VOLUNTEER">
      {/* Tab bar */}
      <div className="flex gap-0 mb-8 border border-border rounded-lg overflow-hidden w-fit text-sm font-semibold">
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2 transition-colors ${
              tab === t.id ? "bg-pink text-white" : "bg-white text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "food"    && <FoodDeliveriesSection onRefresh={onRefresh} />}
      {tab === "waste"   && <WasteRunsSection      onRefresh={onRefresh} />}
      {tab === "history" && <HistorySection />}
    </DashboardShell>
  );
}
