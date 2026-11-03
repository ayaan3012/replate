/**
 * /volunteer — volunteer dashboard
 *
 * Tabs (shown based on vrole):
 *   FOOD_ONLY : [Food deliveries, History]
 *   WASTE_ONLY: [Waste runs, History]
 *   DUAL      : [Food deliveries, Waste runs, History]
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bike, AlertCircle, Check, Copy, ChevronDown, ChevronUp,
  Loader2, X, Package, Truck, CheckCircle2, Clock,
  MapPin, Weight, Trash2, History,
} from "lucide-react";
import {
  call, n,
  type VolunteerProfile,
  type VolunteerImpact,
  type Job,
  type Pickup,
  type WasteJob,
  type WasteSlot,
  type Container,
  type CollectResponse,
  type Collection,
} from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import DashboardShell from "@/components/DashboardShell";

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-muted">
      <AlertCircle size={28} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DELIVERED:    "bg-success-tint text-success",
    IN_TRANSIT:   "bg-blue-tint text-blue",
    ACCEPTED:     "bg-pink-tint text-pink",
    SCHEDULED:    "bg-pink-tint text-pink",
    FAILED:       "bg-error-tint text-error",
    PENDING:      "bg-border text-muted",
    COMPLETED:    "bg-success-tint text-success",
    CANCELLED:    "bg-border text-muted",
  };
  const cls = map[status] ?? "bg-border text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => undefined);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 font-mono font-bold text-ink bg-border rounded px-2 py-0.5 text-xs hover:bg-pink-tint transition-colors"
      title="Copy"
    >
      {value}
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
    </button>
  );
}

interface MiniStepperProps { steps: string[]; current: number }
function MiniStepper({ steps, current }: MiniStepperProps) {
  return (
    <div className="flex items-center gap-0 mt-2">
      {steps.map((step, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5">
              <div className={[
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                done   ? "bg-success text-white"
                : active ? "bg-pink text-white"
                :          "bg-border text-muted",
              ].join(" ")}>
                {done ? <Check size={12} /> : i + 1}
              </div>
              <span className={`text-[10px] whitespace-nowrap ${active ? "text-ink font-semibold" : "text-muted"}`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 w-8 mx-1 mb-4 rounded ${done ? "bg-success" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inline shared constants ──────────────────────────────────────────────────

const inputCls  = "w-full px-3 py-2 rounded border border-border bg-card text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pink transition-colors";
const selectCls = inputCls;

function SectionWrap({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 mb-10">
      <h2 className="text-lg font-bold text-ink mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function fmtSlot(slot_date: string | null, start_time: string | null, end_time: string | null): string {
  if (!slot_date) return "—";
  const d = new Date(slot_date).toLocaleDateString(undefined, { dateStyle: "medium" });
  if (!start_time) return d;
  const s = start_time.slice(0, 5);
  const e = end_time ? end_time.slice(0, 5) : "";
  return `${d}  ${s}${e ? "–" + e : ""}`;
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps { label: string; value: string; icon: ReactNode; color: string }
function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className={`mb-2 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-ink">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  );
}

// ─── Confirmation card ────────────────────────────────────────────────────────

interface ConfirmRow { label: string; value: string | ReactNode }
interface ConfirmationCardProps {
  title:    string;
  rows:     ConfirmRow[];
  button:   string;
  onButton: () => void;
}
function ConfirmationCard({ title, rows, button, onButton }: ConfirmationCardProps) {
  return (
    <div className="rounded-xl border border-success bg-success-tint p-6 flex flex-col gap-4 shadow-sm">
      <div className="flex flex-col items-center gap-2">
        <div className="h-12 w-12 rounded-full bg-success flex items-center justify-center">
          <CheckCircle2 size={24} className="text-white" />
        </div>
        <h3 className="font-bold text-ink text-base">{title}</h3>
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start justify-between gap-4 text-sm">
            <span className="text-muted shrink-0">{r.label}</span>
            <span className="font-semibold text-ink text-right">{r.value}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onButton}
        className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 transition-all"
      >
        {button}
      </button>
    </div>
  );
}

// ─── Report problem dropdown ──────────────────────────────────────────────────

const FAILURE_REASONS: { value: string; label: string }[] = [
  { value: "FOOD_UNSAFE",            label: "Food not safe"        },
  { value: "RECIPIENT_UNAVAILABLE",  label: "Recipient unavailable" },
  { value: "VEHICLE_BREAKDOWN",      label: "Vehicle breakdown"     },
  { value: "OTHER",                  label: "Other"                 },
];

interface ReportMenuProps {
  pickupId: number;
  onDone:   () => void;
}
function ReportMenu({ pickupId, onDone }: ReportMenuProps) {
  const [open, setOpen]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const { toast }         = useToast();
  const ref               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const report = async (reason: string) => {
    setBusy(true);
    setOpen(false);
    try {
      await call("data", "setStatus", { pickup_id: pickupId, status: "FAILED", failure_reason: reason });
      toast("Problem reported.", "info");
      onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not report problem");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        className="flex items-center gap-1 px-3 py-1.5 rounded border border-error text-error text-xs font-semibold hover:bg-error-tint transition-colors"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : null}
        Report a problem
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-md min-w-[180px] py-1">
          {FAILURE_REASONS.map(fr => (
            <button
              key={fr.value}
              onClick={() => report(fr.value)}
              className="w-full text-left px-4 py-2 text-sm text-ink hover:bg-border transition-colors"
            >
              {fr.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Active pickup card ───────────────────────────────────────────────────────

const PICKUP_STEPS = ["Accepted", "In transit", "Delivered"];
const statusToStep: Record<string, number> = {
  ACCEPTED:   0,
  SCHEDULED:  0,
  IN_TRANSIT: 1,
  DELIVERED:  2,
};

interface ActivePickupCardProps {
  pickup:   Pickup;
  onReload: () => void;
}
function ActivePickupCard({ pickup, onReload }: ActivePickupCardProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const stepIndex = statusToStep[pickup.pickup_status] ?? 0;

  const advance = async (status: string) => {
    setBusy(true);
    try {
      await call("data", "setStatus", { pickup_id: pickup.pickup_id, status });
      toast(status === "IN_TRANSIT" ? "Delivery started!" : "Delivery marked complete!", "success");
      onReload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not update status");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="font-bold text-ink text-sm">
            {pickup.food_name} × {pickup.quantity_claimed}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {fmtSlot(pickup.slot_date, pickup.start_time, pickup.end_time)}
          </p>
        </div>
        <StatusBadge status={pickup.pickup_status} />
      </div>

      <div className="text-xs text-muted flex flex-col gap-0.5">
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          From: <span className="text-ink">{pickup.pickup_from}</span>
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          To: <span className="text-ink">{pickup.deliver_to}</span>
        </span>
      </div>

      <MiniStepper steps={PICKUP_STEPS} current={stepIndex} />

      <div className="flex items-center gap-2 flex-wrap mt-1">
        {pickup.pickup_status === "ACCEPTED" || pickup.pickup_status === "SCHEDULED" ? (
          <button
            onClick={() => advance("IN_TRANSIT")}
            disabled={busy}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-pink text-white text-xs font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
            Start delivery
          </button>
        ) : pickup.pickup_status === "IN_TRANSIT" ? (
          <button
            onClick={() => advance("DELIVERED")}
            disabled={busy}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-success text-white text-xs font-bold hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            Mark delivered
          </button>
        ) : null}

        <ReportMenu pickupId={pickup.pickup_id} onDone={onReload} />
      </div>
    </div>
  );
}

// ─── Job card ─────────────────────────────────────────────────────────────────

interface JobCardProps {
  job:      Job;
  onReload: () => void;
  onAccept: (job: Job, slotId: number) => void;
  accepting: boolean;
}
function JobCard({ job, onReload: _onReload, onAccept, accepting }: JobCardProps) {
  const [selectedSlot, setSelectedSlot] = useState<number>(
    job.slots.length > 0 ? job.slots[0].slot_id : -1,
  );

  const noSlots  = job.slots.length === 0;
  const distNum  = n(job.distance_km);
  const distText = distNum > 0 ? `${distNum.toFixed(1)} km` : "—";

  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm flex gap-3 ${noSlots ? "opacity-60" : ""}`}>
      {/* icon tile */}
      <div className="h-10 w-10 shrink-0 rounded-lg bg-pink-tint flex items-center justify-center">
        <Bike size={18} className="text-pink" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="font-bold text-ink text-sm">
              {job.food_name} × {job.quantity_claimed}
            </p>
            <p className="text-xs text-muted mt-0.5">
              From {job.pickup_from} → To {job.deliver_to}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-muted border border-border rounded-full px-2 py-0.5">
              {distText}
            </span>
            {!job.within_radius && (
              <span className="text-xs font-semibold bg-error-tint text-error rounded-full px-2 py-0.5">
                outside your radius
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {noSlots ? (
            <span className="text-xs text-muted">No free slots</span>
          ) : (
            <select
              className={`${selectCls} w-auto text-xs py-1`}
              value={selectedSlot}
              onChange={e => setSelectedSlot(Number(e.target.value))}
            >
              {job.slots.map(s => (
                <option key={s.slot_id} value={s.slot_id}>
                  {fmtSlot(s.slot_date, s.start_time, s.end_time)}
                </option>
              ))}
            </select>
          )}

          {!noSlots && (
            <button
              onClick={() => onAccept(job, selectedSlot)}
              disabled={accepting}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-pink text-white text-xs font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {accepting ? <Loader2 size={12} className="animate-spin" /> : null}
              Accept
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Food deliveries ─────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(["ACCEPTED", "SCHEDULED", "IN_TRANSIT"]);

interface AcceptedJob { job: Job; slotId: number; pickupId: number }

function FoodDeliveriesTab() {
  const { toast }    = useToast();
  const activeRef    = useRef<HTMLDivElement>(null);

  const [jobs,        setJobs]        = useState<Job[] | null>(null);
  const [pickups,     setPickups]     = useState<Pickup[] | null>(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingPU,   setLoadingPU]   = useState(true);
  const [acceptingId, setAcceptingId] = useState<number | null>(null);

  // After accept: confirmed card state
  const [accepted, setAccepted] = useState<AcceptedJob | null>(null);

  const loadJobs = useCallback(() => {
    setLoadingJobs(true);
    call<Job[]>("data", "jobs")
      .then(setJobs)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load jobs"))
      .finally(() => setLoadingJobs(false));
  }, [toast]);

  const loadPickups = useCallback(() => {
    setLoadingPU(true);
    call<Pickup[]>("data", "myPickups")
      .then(setPickups)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load pickups"))
      .finally(() => setLoadingPU(false));
  }, [toast]);

  useEffect(() => {
    loadJobs();
    loadPickups();
  }, [loadJobs, loadPickups]);

  const reload = useCallback(() => {
    loadJobs();
    loadPickups();
  }, [loadJobs, loadPickups]);

  const handleAccept = async (job: Job, slotId: number) => {
    setAcceptingId(job.claim_id);
    try {
      const res = await call<{ ok: number; pickup_id: number }>("data", "accept", {
        claim_id: job.claim_id,
        slot_id:  slotId,
      });
      toast("Job accepted!", "success");
      setAccepted({ job, slotId, pickupId: res.pickup_id });
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not accept job");
    } finally {
      setAcceptingId(null);
    }
  };

  const activePickups = pickups?.filter(p => ACTIVE_STATUSES.has(p.pickup_status)) ?? [];

  // Find slot info for accepted card
  const acceptedSlot = accepted
    ? accepted.job.slots.find(s => s.slot_id === accepted.slotId) ?? null
    : null;

  if (accepted) {
    return (
      <div className="flex flex-col gap-6">
        <ConfirmationCard
          title="Job accepted!"
          rows={[
            { label: "Food",        value: `${accepted.job.food_name} × ${accepted.job.quantity_claimed}` },
            { label: "Pickup from", value: accepted.job.pickup_from },
            { label: "Deliver to",  value: accepted.job.deliver_to  },
            { label: "Slot",        value: acceptedSlot
                ? fmtSlot(acceptedSlot.slot_date, acceptedSlot.start_time, acceptedSlot.end_time)
                : "—" },
          ]}
          button="View my pickups"
          onButton={() => {
            setAccepted(null);
            setTimeout(() => activeRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
          }}
        />
        <button
          onClick={() => setAccepted(null)}
          className="text-sm text-muted hover:text-ink transition-colors text-center"
        >
          Back to job list
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Active pickups */}
      <div ref={activeRef}>
        <h3 className="text-sm font-bold text-ink mb-3">Active pickups</h3>
        {loadingPU ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : activePickups.length === 0 ? (
          <EmptyState message="No active pickups right now." />
        ) : (
          <div className="flex flex-col gap-3">
            {activePickups.map(p => (
              <ActivePickupCard key={p.pickup_id} pickup={p} onReload={reload} />
            ))}
          </div>
        )}
      </div>

      {/* Available jobs */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-3">Available jobs</h3>
        {loadingJobs ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <EmptyState message="No available jobs right now. Check back soon." />
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map(job => (
              <JobCard
                key={job.claim_id}
                job={job}
                onReload={reload}
                onAccept={handleAccept}
                accepting={acceptingId === job.claim_id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Waste runs ──────────────────────────────────────────────────────────

const ROUTE_TYPE_STYLE: Record<string, string> = {
  ANIMAL_SHELTER: "bg-pink-tint text-pink",
  FARM:           "bg-success-tint text-success",
  BIOGAS:         "bg-blue-tint text-blue",
  COMPOST:        "bg-border text-muted",
};

interface WasteGroup {
  partner_id:      number;
  partner_name:    string;
  partner_address: string;
  route_type:      string;
  jobs:            WasteJob[];
}

function groupByPartner(jobs: WasteJob[]): WasteGroup[] {
  const map = new Map<number, WasteGroup>();
  for (const job of jobs) {
    if (!map.has(job.partner_id)) {
      map.set(job.partner_id, {
        partner_id:      job.partner_id,
        partner_name:    job.partner_name,
        partner_address: job.partner_address,
        route_type:      job.route_type,
        jobs:            [],
      });
    }
    map.get(job.partner_id)!.jobs.push(job);
  }
  return [...map.values()];
}

interface ReceiptState {
  collectionId: number;
  receiptRef:   string;
  partnerName:  string;
  weighedKg:    number;
}

function WasteRunsTab() {
  const { toast } = useToast();

  const [wasteJobs,   setWasteJobs]   = useState<WasteJob[] | null>(null);
  const [wasteSlots,  setWasteSlots]  = useState<WasteSlot[] | null>(null);
  const [containers,  setContainers]  = useState<Container[] | null>(null);
  const [loading,     setLoading]     = useState(true);

  // Selection: map of waste_id → true, constrained to one partner
  const [selected,     setSelected]     = useState<Set<number>>(new Set());
  const [activePartner, setActivePartner] = useState<number | null>(null);

  // Form fields
  const [slotId,     setSlotId]     = useState<number>(-1);
  const [containerId, setContainerId] = useState<number>(-1);
  const [vehicleNo,  setVehicleNo]  = useState("");
  const [weighedKg,  setWeighedKg]  = useState("");
  const [formErr,    setFormErr]    = useState("");
  const [collecting, setCollecting] = useState(false);

  // Receipt
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      call<WasteJob[]>("data", "wasteJobs"),
      call<WasteSlot[]>("data", "wasteSlots"),
      call<Container[]>("data", "containers"),
    ])
      .then(([wj, ws, ct]) => {
        setWasteJobs(wj);
        setWasteSlots(ws);
        setContainers(ct);
        if (ws.length > 0) setSlotId(ws[0].slot_id);
        if (ct.length > 0) setContainerId(ct[0].container_id);
      })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load waste data"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleItem = (job: WasteJob) => {
    const { waste_id, partner_id } = job;
    if (activePartner !== null && activePartner !== partner_id) {
      // Switch partner — clear old selection
      const newSet = new Set<number>();
      newSet.add(waste_id);
      setSelected(newSet);
      setActivePartner(partner_id);
      return;
    }
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(waste_id)) {
        s.delete(waste_id);
        if (s.size === 0) setActivePartner(null);
      } else {
        s.add(waste_id);
        setActivePartner(partner_id);
      }
      return s;
    });
  };

  const handleCollect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr("");
    if (selected.size === 0) { setFormErr("Select at least one item."); return; }
    if (slotId < 0) { setFormErr("Select a slot."); return; }
    if (containerId < 0) { setFormErr("Select a container."); return; }
    if (!vehicleNo.trim()) { setFormErr("Enter vehicle number."); return; }
    const kg = parseFloat(weighedKg);
    if (!weighedKg || isNaN(kg) || kg <= 0) { setFormErr("Enter a valid weight."); return; }

    const partnerName = wasteJobs?.find(j => selected.has(j.waste_id))?.partner_name ?? "";

    setCollecting(true);
    try {
      const res = await call<CollectResponse>("data", "collect", {
        waste_ids:    [...selected],
        slot_id:      slotId,
        container_id: containerId,
        vehicle_no:   vehicleNo.trim(),
        weighed_kg:   kg,
      });
      toast("Collection recorded!", "success");
      setReceipt({
        collectionId: res.collection_id,
        receiptRef:   res.receipt_ref,
        partnerName,
        weighedKg:    kg,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not record collection";
      toast(msg);
      setFormErr(msg);
    } finally {
      setCollecting(false);
    }
  };

  if (receipt) {
    return (
      <ConfirmationCard
        title="Collection recorded"
        rows={[
          { label: "Receipt ref",    value: <CopyChip value={receipt.receiptRef} /> },
          { label: "Collection ID",  value: String(receipt.collectionId)           },
          { label: "Partner",        value: receipt.partnerName                     },
          { label: "Weight collected", value: `${receipt.weighedKg.toFixed(2)} kg` },
        ]}
        button="Done"
        onButton={() => {
          setReceipt(null);
          setSelected(new Set());
          setActivePartner(null);
          setVehicleNo("");
          setWeighedKg("");
          setFormErr("");
          loadAll();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  const groups = groupByPartner(wasteJobs ?? []);
  const selectedGroup = groups.find(g => g.partner_id === activePartner) ?? null;

  return (
    <div className="flex flex-col gap-8">
      {/* Partner groups */}
      {groups.length === 0 ? (
        <EmptyState message="No waste jobs available right now." />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(g => {
            const rtStyle = ROUTE_TYPE_STYLE[g.route_type] ?? "bg-border text-muted";
            return (
              <div key={g.partner_id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <p className="font-bold text-ink text-sm">{g.partner_name}</p>
                  <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${rtStyle}`}>
                    {g.route_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-muted">{g.partner_address}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {g.jobs.map(job => (
                    <label
                      key={job.waste_id}
                      className="flex items-center gap-3 cursor-pointer rounded p-2 hover:bg-border transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(job.waste_id)}
                        onChange={() => toggleItem(job)}
                        className="w-4 h-4 accent-[var(--color-pink)]"
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-ink">{job.food_name}</span>
                        <span className="block text-xs text-muted">
                          {n(job.quantity_kg).toFixed(2)} kg · Grade: {job.condition_grade}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Collection form — shown when items are selected */}
      {selected.size > 0 && selectedGroup && (
        <div className="rounded-xl border border-pink bg-pink-tint/30 p-5">
          <p className="text-sm font-bold text-ink mb-4">
            Collecting {selected.size} routing{selected.size !== 1 ? "s" : ""} from {selectedGroup.partner_name}
          </p>
          <form onSubmit={handleCollect} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Slot">
                <select
                  className={selectCls}
                  value={slotId}
                  onChange={e => setSlotId(Number(e.target.value))}
                >
                  {(wasteSlots ?? []).length === 0 && (
                    <option value={-1}>No slots available</option>
                  )}
                  {(wasteSlots ?? []).map(s => (
                    <option key={s.slot_id} value={s.slot_id}>
                      {fmtSlot(s.slot_date, s.start_time, s.end_time)}
                      {" "}({s.capacity - s.booked} free)
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Container">
                <select
                  className={selectCls}
                  value={containerId}
                  onChange={e => setContainerId(Number(e.target.value))}
                >
                  {(containers ?? []).length === 0 && (
                    <option value={-1}>No containers</option>
                  )}
                  {(containers ?? []).map(c => (
                    <option key={c.container_id} value={c.container_id}>
                      {c.label} ({c.container_type})
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Vehicle number">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="DL01AB1234"
                  value={vehicleNo}
                  onChange={e => setVehicleNo(e.target.value)}
                />
              </Field>

              <Field label="Weighed kg">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className={inputCls}
                  placeholder="42.5"
                  value={weighedKg}
                  onChange={e => setWeighedKg(e.target.value)}
                />
              </Field>
            </div>

            {formErr && (
              <p className="text-xs text-error">{formErr}</p>
            )}

            <button
              type="submit"
              disabled={collecting}
              className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {collecting
                ? <><Loader2 size={14} className="inline animate-spin mr-1" />Collecting…</>
                : "Collect"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Tab: History ─────────────────────────────────────────────────────────────

function HistoryTab() {
  const { toast } = useToast();

  const [pickups,     setPickups]     = useState<Pickup[] | null>(null);
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [impact,      setImpact]      = useState<VolunteerImpact | null>(null);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      call<Pickup[]>("data", "myPickups"),
      call<Collection[]>("data", "myCollections"),
      call<VolunteerImpact>("data", "myImpact"),
    ])
      .then(([pu, col, imp]) => {
        setPickups(pu);
        setCollections(col);
        setImpact(imp);
      })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load history"))
      .finally(() => setLoading(false));
  }, [toast]);

  const stats = impact
    ? [
        { label: "Deliveries",      value: String(impact.deliveries_completed), icon: <Truck size={18} />,    color: "text-pink"    },
        { label: "Kg delivered",    value: n(impact.kg_delivered).toFixed(1),   icon: <Weight size={18} />,   color: "text-blue"    },
        { label: "Meals delivered", value: n(impact.meals_delivered).toFixed(0), icon: <Package size={18} />, color: "text-success" },
        { label: "Waste collected", value: `${n(impact.waste_kg_collected).toFixed(1)} kg`, icon: <Trash2 size={18} />, color: "text-muted" },
      ]
    : [];

  return (
    <div className="flex flex-col gap-8">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {loading
          ? [1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-lg" />)
          : stats.map(s => (
              <StatCard key={s.label} label={s.label} value={s.value} icon={s.icon} color={s.color} />
            ))
        }
      </div>

      {/* Pickups table */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-3">Pickup history</h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !pickups || pickups.length === 0 ? (
          <EmptyState message="No pickups yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-tint text-left">
                  {["Food", "Qty", "From", "To", "Status", "Delivered at"].map(h => (
                    <th key={h} className="px-4 py-2.5 font-semibold text-blue text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pickups.map(p => (
                  <tr key={p.pickup_id} className="border-t border-border hover:bg-pink-tint/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{p.food_name}</td>
                    <td className="px-4 py-3 text-muted">{p.quantity_claimed}</td>
                    <td className="px-4 py-3 text-muted text-xs max-w-[140px] truncate">{p.pickup_from}</td>
                    <td className="px-4 py-3 text-muted text-xs max-w-[140px] truncate">{p.deliver_to}</td>
                    <td className="px-4 py-3"><StatusBadge status={p.pickup_status} /></td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(p.delivered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Collections table */}
      <div>
        <h3 className="text-sm font-bold text-ink mb-3">Collection history</h3>
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !collections || collections.length === 0 ? (
          <EmptyState message="No collections yet." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-tint text-left">
                  {["Partner", "Kg", "Receipt ref", "Collected at"].map(h => (
                    <th key={h} className="px-4 py-2.5 font-semibold text-blue text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collections.map(c => (
                  <tr key={c.collection_id} className="border-t border-border hover:bg-pink-tint/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-ink">{c.partner_name}</td>
                    <td className="px-4 py-3 text-muted">{n(c.weighed_kg).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-ink">{c.receipt_ref}</span>
                    </td>
                    <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{fmtDate(c.collected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab definitions per vrole ────────────────────────────────────────────────

type TabId = "food-deliveries" | "waste-runs" | "my-history";

interface TabDef { id: TabId; label: string; icon: ReactNode }

function tabsForVRole(vrole: string): TabDef[] {
  const food:  TabDef = { id: "food-deliveries", label: "Food deliveries", icon: <Bike  size={14} /> };
  const waste: TabDef = { id: "waste-runs",       label: "Waste runs",       icon: <Trash2 size={14} /> };
  const hist:  TabDef = { id: "my-history",       label: "History",          icon: <History size={14} /> };
  if (vrole === "FOOD_ONLY")  return [food, hist];
  if (vrole === "WASTE_ONLY") return [waste, hist];
  return [food, waste, hist];
}

function subtitleForVRole(vrole: string): string {
  if (vrole === "FOOD_ONLY")  return "Food deliveries";
  if (vrole === "WASTE_ONLY") return "Waste runs";
  return "Food deliveries & waste runs";
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Volunteer() {
  const { toast } = useToast();
  const [profile,  setProfile]  = useState<VolunteerProfile | null>(null);
  const [loadingP, setLoadingP] = useState(true);

  useEffect(() => {
    call<VolunteerProfile>("data", "profile")
      .then(setProfile)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load profile"))
      .finally(() => setLoadingP(false));
  }, [toast]);

  const vrole   = profile?.vrole ?? "FOOD_ONLY";
  const tabs    = tabsForVRole(vrole);
  const [activeTab, setActiveTab] = useState<TabId>("food-deliveries");

  // Ensure activeTab is valid for this vrole
  useEffect(() => {
    if (!tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [vrole, tabs, activeTab]);

  const subtitle = loadingP ? "" : subtitleForVRole(vrole);

  return (
    <DashboardShell role="VOLUNTEER" title="Volunteer" subtitle={subtitle}>
      {/* Tab bar */}
      <div className="flex gap-0 mb-8 border border-border rounded-lg overflow-hidden w-fit text-sm font-semibold">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={[
              "flex items-center gap-1.5 px-5 py-2 transition-colors",
              activeTab === t.id
                ? "bg-pink text-white"
                : "bg-card text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "food-deliveries" && <FoodDeliveriesTab />}
      {activeTab === "waste-runs"      && <WasteRunsTab />}
      {activeTab === "my-history"      && <HistoryTab />}
    </DashboardShell>
  );
}
