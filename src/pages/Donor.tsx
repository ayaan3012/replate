/**
 * /donor — full donor dashboard
 *
 * Sections (ids match sidebar anchors):
 *   overview        — impact stat cards + listing counts
 *   donate-hub      — HubMap + AddressSearch + HubList + "Donate here" dialog
 *   donate-delivery — dialog: food fields + sealed checkbox, no hub
 *   unfit-food      — dialog: category/name/qty + animal vs biogas grade
 *   my-donations    — tabs: Listings table (with handover expand) + Rerouted waste
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Utensils, Leaf, Wind, Copy, Check, ChevronDown, ChevronUp,
  Loader2, X, AlertCircle,
} from "lucide-react";
import { call, n, type Category, type Tag, type DonorProfile,
         type DonorImpact, type Listing, type Routing, type Hub,
         type ReportUnfitResponse } from "@/lib/api";
import { useAuth }  from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import DashboardShell from "@/components/DashboardShell";
import HubMap         from "@/components/HubMap";
import HubList        from "@/components/HubList";
import AddressSearch  from "@/components/AddressSearch";

// ─── tiny shared primitives ───────────────────────────────────────────────────

function SectionWrap({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">{title}</h2>
      {children}
    </section>
  );
}

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
    AVAILABLE: "bg-success-tint text-success",
    EXPIRED:   "bg-error-tint text-error",
    CLAIMED:   "bg-blue-tint text-blue",
    ROUTED:    "bg-pink-tint text-pink",
    RESERVED:  "bg-blue-tint text-blue",
  };
  const cls = map[status] ?? "bg-border text-muted";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ─── Dialog shell ─────────────────────────────────────────────────────────────

interface DialogProps { title: string; onClose: () => void; children: ReactNode }
function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-border shadow-lg p-6 focus:outline-none"
      >
        <div className="flex items-start justify-between mb-5">
          <h3 className="font-bold text-ink text-base">{title}</h3>
          <button onClick={onClose} className="p-1 rounded text-muted hover:text-ink hover:bg-border">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Form primitives ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

const inputCls = "mt-0.5 w-full px-3 py-2 rounded border border-border bg-white text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pink transition-colors";
const selectCls = `${inputCls}`;

function SubmitBtn({ loading, children }: { loading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full mt-1 py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
    >
      {loading ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
      {loading ? "Saving…" : children}
    </button>
  );
}

// ─── Food listing form (shared by hub + delivery dialogs) ─────────────────────

type StorageOpt = "HOT" | "AMBIENT" | "REFRIGERATED";

interface ListingFormProps {
  categories:     Category[];
  tags:           Tag[];
  storageOptions: StorageOpt[];   // computed from hub compartments or all three
  hubId:          number | null;
  onSuccess:      (id: number) => void;
  onClose:        () => void;
}

function ListingForm({ categories, tags, storageOptions, hubId, onSuccess, onClose }: ListingFormProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const dietTags     = tags.filter(t => t.type === "DIET");
  const allergenTags = tags.filter(t => t.type === "ALLERGEN");

  // allergen state: "contains" | "free" | "unsure"
  const [allergenMap, setAllergenMap] = useState<Record<number, "contains" | "free" | "unsure">>({});
  const [selectedDiet, setSelectedDiet] = useState<Set<number>>(new Set());

  const toggleDiet = (id: number) =>
    setSelectedDiet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => fd.get(k) as string;

    const allergens = allergenTags
      .map(t => ({ tag_id: t.id, val: allergenMap[t.id] ?? "unsure" }))
      .filter(a => a.val !== "unsure")
      .map(a => ({ tag_id: a.tag_id, contains: a.val === "contains" }));

    setBusy(true);
    try {
      const res = await call<{ id: number }>("data", "addListing", {
        category_id: Number(get("category_id")),
        food_name:   get("food_name"),
        qty:         Number(get("qty")),
        unit:        get("unit"),
        weight:      Number(get("weight")),
        hours:       Number(get("hours")),
        storage:     get("storage"),
        is_sealed:   hubId ? true : fd.get("is_sealed") === "on",
        hub_id:      hubId ?? undefined,
        tag_ids:     [...selectedDiet],
        allergens,
      });
      toast("Listing published!", "success");
      onSuccess(res.id);
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not publish listing");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {hubId && (
        <p className="text-xs font-semibold text-pink bg-pink-tint rounded px-3 py-2">
          Hub donation — food must be sealed. Storage options are limited to what this hub supports.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Food name">
          <input name="food_name" required className={inputCls} placeholder="Paneer rice bowls" />
        </Field>
        <Field label="Category">
          <select name="category_id" required className={selectCls}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Quantity">
          <input name="qty" type="number" min="1" defaultValue="10" required className={inputCls} />
        </Field>
        <Field label="Unit">
          <select name="unit" className={selectCls}>
            {["plates","packets","kg"].map(u => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Kg per unit">
          <input name="weight" type="number" step="0.05" min="0.05" defaultValue="0.4" required className={inputCls} />
        </Field>
        <Field label="Expires in (hours)">
          <input name="hours" type="number" min="1" defaultValue="4" required className={inputCls} />
        </Field>
      </div>

      <Field label="Storage">
        <select name="storage" className={selectCls}>
          {storageOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>

      {!hubId && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
          <input type="checkbox" name="is_sealed" className="w-4 h-4 accent-[var(--color-pink)]" />
          Sealed food (required for hub donations)
        </label>
      )}

      {/* Diet tags */}
      {dietTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink mb-2">Diet tags</p>
          <div className="flex flex-wrap gap-2">
            {dietTags.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleDiet(t.id)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  selectedDiet.has(t.id)
                    ? "border-pink bg-pink-tint text-pink font-semibold"
                    : "border-border text-muted hover:border-pink"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Allergens */}
      {allergenTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-ink mb-2">Allergens</p>
          <div className="flex flex-col gap-1.5">
            {allergenTags.map(t => {
              const val = allergenMap[t.id] ?? "unsure";
              return (
                <div key={t.id} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-ink w-28 shrink-0">{t.name}</span>
                  <div className="flex gap-1">
                    {(["contains","free","unsure"] as const).map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setAllergenMap(m => ({ ...m, [t.id]: opt }))}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                          val === opt
                            ? opt === "contains" ? "border-error bg-error-tint text-error font-semibold"
                              : opt === "free"    ? "border-success bg-success-tint text-success font-semibold"
                              :                     "border-border bg-border text-muted font-semibold"
                            : "border-border text-muted hover:border-ink"
                        }`}
                      >
                        {opt === "contains" ? "Contains" : opt === "free" ? "Free of" : "Not sure"}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-1">"Not sure" entries are not recorded.</p>
        </div>
      )}

      <SubmitBtn loading={busy}>Publish listing</SubmitBtn>
    </form>
  );
}

// ─── CopyChip ─────────────────────────────────────────────────────────────────

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 font-mono font-bold text-ink bg-border rounded px-2 py-0.5 text-xs hover:bg-pink-tint transition-colors"
      title="Copy code"
    >
      {value}
      {copied ? <Check size={11} className="text-success" /> : <Copy size={11} />}
    </button>
  );
}

// ─── Section 1: Overview ──────────────────────────────────────────────────────

function OverviewSection({ listings }: { listings: Listing[] | null }) {
  const [impact, setImpact] = useState<DonorImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    call<DonorImpact>("data", "myImpact")
      .then(setImpact)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load impact"))
      .finally(() => setLoading(false));
  }, []);

  const stats = impact
    ? [
        { label: "Meals saved",  value: n(impact.meals_saved).toFixed(0),   Icon: Utensils, color: "text-pink" },
        { label: "Kg diverted",  value: n(impact.kg_diverted).toFixed(1),   Icon: Leaf,     color: "text-success" },
        { label: "CO₂ avoided",  value: `${n(impact.co2_avoided_kg).toFixed(1)} kg`, Icon: Wind, color: "text-blue" },
      ]
    : [];

  const available = listings?.filter(l => l.status === "AVAILABLE").length ?? 0;
  const total     = listings?.length ?? 0;

  return (
    <SectionWrap id="overview" title="Overview">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : stats.map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-white p-5 shadow-sm">
                <s.Icon size={20} className={`mb-2 ${s.color}`} />
                <p className="text-2xl font-bold text-ink">{s.value}</p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
              </div>
            ))
        }
        {/* listing counts */}
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-ink">{listings === null ? "—" : available}</p>
          <p className="text-xs text-muted mt-0.5">Active listings</p>
        </div>
        <div className="rounded-lg border border-border bg-white p-5 shadow-sm">
          <p className="text-2xl font-bold text-ink">{listings === null ? "—" : total}</p>
          <p className="text-xs text-muted mt-0.5">Total listings</p>
        </div>
      </div>
    </SectionWrap>
  );
}

// ─── Section 2: Donate to a hub ───────────────────────────────────────────────

interface DonateHubSectionProps {
  profile:    DonorProfile | null;
  categories: Category[];
  tags:       Tag[];
  onRefresh:  () => void;
}

function DonateHubSection({ profile, categories, tags, onRefresh }: DonateHubSectionProps) {
  const [hubs,        setHubs]        = useState<Hub[]>([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [userLoc,     setUserLoc]     = useState<{ lat: number; lng: number } | null>(null);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const { toast } = useToast();

  // Default user location from profile
  useEffect(() => {
    if (profile) setUserLoc({ lat: n(profile.latitude), lng: n(profile.longitude) });
  }, [profile]);

  // Load all hubs
  useEffect(() => {
    call<Hub[]>("hubs", "list")
      .then(setHubs)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load hubs"))
      .finally(() => setLoadingHubs(false));
  }, []);

  const selectedHub = hubs.find(h => h.hub_id === selectedId) ?? null;

  // Determine storage options from the selected hub's compartments
  const storageOptions: ("AMBIENT" | "REFRIGERATED")[] = selectedHub
    ? [
        ...(selectedHub.compartments.some(c => !c.temp_controlled) ? ["AMBIENT" as const] : []),
        ...(selectedHub.compartments.some(c => c.temp_controlled)  ? ["REFRIGERATED" as const] : []),
      ]
    : ["AMBIENT", "REFRIGERATED"];

  return (
    <SectionWrap id="donate-hub" title="Donate to a hub">
      <AddressSearch
        onResult={(nearHubs, coords) => {
          setHubs(nearHubs);
          setUserLoc(coords);
          if (nearHubs.length > 0) setSelectedId(nearHubs[0].hub_id);
        }}
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Map */}
        <div className="h-72 rounded-lg overflow-hidden border border-border">
          {loadingHubs
            ? <Skeleton className="h-full w-full" />
            : <HubMap
                hubs={hubs}
                userLocation={userLoc}
                selectedHubId={selectedId}
                onSelect={setSelectedId}
              />
          }
        </div>

        {/* Hub list */}
        <div className="overflow-y-auto max-h-72">
          {loadingHubs
            ? <Skeleton className="h-24 w-full" />
            : <HubList hubs={hubs} selectedHubId={selectedId} onSelect={setSelectedId} />
          }
        </div>
      </div>

      {/* Donate here button */}
      {selectedHub && (
        <div className="mt-4 flex items-center gap-3">
          <span className="text-sm text-muted">Selected: <strong className="text-ink">{selectedHub.name}</strong></span>
          <button
            onClick={() => setDialogOpen(true)}
            className="ml-auto px-5 py-2 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 transition-all"
          >
            Donate here
          </button>
        </div>
      )}

      {dialogOpen && selectedHub && (
        <Dialog title={`Donate to ${selectedHub.name}`} onClose={() => setDialogOpen(false)}>
          <ListingForm
            categories={categories}
            tags={tags}
            storageOptions={storageOptions}
            hubId={selectedHub.hub_id}
            onSuccess={onRefresh}
            onClose={() => setDialogOpen(false)}
          />
        </Dialog>
      )}
    </SectionWrap>
  );
}

// ─── Section 3: Donate for delivery ──────────────────────────────────────────

interface DonateDeliverySectionProps {
  categories: Category[];
  tags:       Tag[];
  onRefresh:  () => void;
}

function DonateDeliverySection({ categories, tags, onRefresh }: DonateDeliverySectionProps) {
  const [open, setOpen] = useState(false);
  const ALL_STORAGE: ("HOT" | "AMBIENT" | "REFRIGERATED")[] = ["HOT", "AMBIENT", "REFRIGERATED"];

  return (
    <SectionWrap id="donate-delivery" title="Donate for delivery">
      <p className="text-sm text-muted mb-4">
        A volunteer will pick up the food from you and deliver it directly to a recipient.
        Food can be hot, ambient, or refrigerated. Sealing is optional but recommended.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 transition-all"
      >
        Create delivery donation
      </button>

      {open && (
        <Dialog title="Donate for delivery" onClose={() => setOpen(false)}>
          <ListingForm
            categories={categories}
            tags={tags}
            storageOptions={ALL_STORAGE}
            hubId={null}
            onSuccess={onRefresh}
            onClose={() => setOpen(false)}
          />
        </Dialog>
      )}
    </SectionWrap>
  );
}

// ─── Section 4: Unfit food ────────────────────────────────────────────────────

interface UnfitSectionProps {
  categories: Category[];
  onRefresh:  () => void;
}

function UnfitSection({ categories, onRefresh }: UnfitSectionProps) {
  const [open,   setOpen]   = useState(false);
  const [busy,   setBusy]   = useState(false);
  const [result, setResult] = useState<ReportUnfitResponse | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd  = new FormData(e.currentTarget);
    const get = (k: string) => fd.get(k) as string;
    setBusy(true);
    setResult(null);
    try {
      const res = await call<ReportUnfitResponse>("data", "reportUnfit", {
        category_id: Number(get("category_id")),
        food_name:   get("food_name"),
        qty:         Number(get("qty")),
        unit:        get("unit"),
        weight:      Number(get("weight")),
        grade:       get("grade"),
      });
      setResult(res);
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not report unfit food");
      setBusy(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionWrap id="unfit-food" title="Unfit food">
      <p className="text-sm text-muted mb-4">
        Food no longer fit for human consumption is routed to animal shelters, farms, or biogas plants.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2.5 rounded-lg border-2 border-error text-error text-sm font-bold hover:bg-error-tint transition-colors"
      >
        Report unfit food
      </button>

      {open && (
        <Dialog title="Food not fit for people" onClose={() => { setOpen(false); setResult(null); }}>
          {result ? (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg bg-success-tint border border-success p-4">
                <p className="text-sm font-semibold text-success mb-1">Food routed successfully</p>
                <p className="text-sm text-ink">Partner: <strong>{result.partner_name}</strong></p>
                <p className="text-sm text-ink">Route: <strong>{result.route_type}</strong></p>
                <p className="text-sm text-ink">Weight: <strong>{n(result.kg).toFixed(2)} kg</strong></p>
              </div>
              <button
                onClick={() => { setOpen(false); setResult(null); }}
                className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select name="category_id" required className={selectCls}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Food name">
                  <input name="food_name" required className={inputCls} placeholder="Stale bread" />
                </Field>
                <Field label="Quantity">
                  <input name="qty" type="number" min="1" defaultValue="10" required className={inputCls} />
                </Field>
                <Field label="Unit">
                  <select name="unit" className={selectCls}>
                    {["kg","loaves","plates","packets"].map(u => <option key={u}>{u}</option>)}
                  </select>
                </Field>
                <Field label="Kg per unit">
                  <input name="weight" type="number" step="0.05" min="0.05" defaultValue="1" required className={inputCls} />
                </Field>
              </div>

              <fieldset className="border border-border rounded-lg p-3">
                <legend className="text-xs font-semibold text-ink px-1">Condition</legend>
                <div className="flex flex-col gap-2 mt-1">
                  {[
                    { value: "ANIMAL_OK",   label: "Safe for animals", desc: "Goes to farms or animal shelters" },
                    { value: "BIOGAS_ONLY", label: "Only for biogas",   desc: "Not safe for animals either" },
                  ].map(opt => (
                    <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                      <input type="radio" name="grade" value={opt.value} defaultChecked={opt.value === "ANIMAL_OK"} className="mt-0.5 accent-[var(--color-pink)]" />
                      <span>
                        <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                        <span className="block text-xs text-muted">{opt.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <SubmitBtn loading={busy}>Route this food</SubmitBtn>
            </form>
          )}
        </Dialog>
      )}
    </SectionWrap>
  );
}

// ─── Section 5: My donations ──────────────────────────────────────────────────

function MyDonationsSection({ listings, routings, loading }: {
  listings: Listing[] | null;
  routings: Routing[] | null;
  loading:  boolean;
}) {
  const [tab,      setTab]      = useState<"listings" | "waste">("listings");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpand = (id: number) =>
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  return (
    <SectionWrap id="my-donations" title="My donations">
      {/* Tab toggle */}
      <div className="flex gap-0 mb-5 border border-border rounded-lg overflow-hidden w-fit text-sm font-semibold">
        {(["listings","waste"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 transition-colors ${
              tab === t ? "bg-pink text-white" : "bg-white text-muted hover:text-ink"
            }`}
          >
            {t === "listings" ? "Listings" : "Rerouted waste"}
          </button>
        ))}
      </div>

      {/* ── Listings tab ── */}
      {tab === "listings" && (
        loading
          ? <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          : !listings?.length
          ? <EmptyState message="No listings yet. Donate food to see it here." />
          : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-tint text-left">
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Food</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Remaining</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Status</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Expires</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Hub</th>
                    <th className="px-4 py-2.5 text-xs" />
                  </tr>
                </thead>
                <tbody>
                  {listings.map(l => {
                    const isExp = expanded.has(l.listing_id);
                    const hasHandovers = l.hub_name && l.handovers.length > 0;
                    return (
                      <>
                        <tr key={l.listing_id} className="border-t border-border hover:bg-pink-tint/30 transition-colors">
                          <td className="px-4 py-3 font-medium text-ink">{l.food_name}</td>
                          <td className="px-4 py-3 text-muted">
                            {n(l.quantity_remaining)} {l.quantity_unit}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                          <td className="px-4 py-3 text-muted text-xs">
                            {new Date(l.expires_at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="px-4 py-3 text-muted text-xs">{l.hub_name ?? "—"}</td>
                          <td className="px-4 py-3">
                            {hasHandovers && (
                              <button onClick={() => toggleExpand(l.listing_id)} className="text-muted hover:text-ink">
                                {isExp ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded handover rows */}
                        {isExp && l.handovers.map(hv => (
                          <tr key={hv.handover_id} className="bg-pink-tint/50 border-t border-pink/20">
                            <td colSpan={6} className="px-6 py-3">
                              <div className="flex flex-wrap items-center gap-4 text-xs text-ink">
                                <span>
                                  <span className="text-muted">Recipient: </span>
                                  <strong>{hv.recipient_name}</strong>
                                </span>
                                <span>
                                  <span className="text-muted">Qty: </span>
                                  <strong>{hv.quantity_claimed}</strong>
                                </span>
                                <StatusBadge status={hv.status} />
                                <span>
                                  <span className="text-muted">Compartment: </span>
                                  <strong>{hv.compartment_label}</strong>
                                </span>
                                {hv.drop_code && (
                                  <span className="flex items-center gap-2">
                                    <span className="text-muted">Drop code:</span>
                                    <CopyChip value={hv.drop_code} />
                                    <span className="text-muted italic">
                                      Type the order number and this code on the Hub Screen
                                    </span>
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
      )}

      {/* ── Rerouted waste tab ── */}
      {tab === "waste" && (
        loading
          ? <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          : !routings?.length
          ? <EmptyState message="No rerouted waste yet." />
          : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-blue-tint text-left">
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Food</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Partner</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Route</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Kg</th>
                    <th className="px-4 py-2.5 font-semibold text-blue text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {routings.map(r => (
                    <tr key={r.waste_id} className="border-t border-border hover:bg-pink-tint/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-ink">{r.food_name}</td>
                      <td className="px-4 py-3 text-muted">{r.partner_name}</td>
                      <td className="px-4 py-3 text-muted">{r.route_type}</td>
                      <td className="px-4 py-3 text-muted">{n(r.quantity_kg).toFixed(2)}</td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </SectionWrap>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Donor() {
  const { toast } = useToast();

  const [profile,    setProfile]    = useState<DonorProfile | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags,       setTags]       = useState<Tag[]>([]);
  const [listings,   setListings]   = useState<Listing[] | null>(null);
  const [routings,   setRoutings]   = useState<Routing[] | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const loadListings = () =>
    Promise.all([
      call<Listing[]>("data", "myListings"),
      call<Routing[]>("data", "myRoutings"),
    ])
    .then(([ls, rs]) => { setListings(ls); setRoutings(rs); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load donations"));

  useEffect(() => {
    Promise.all([
      call<DonorProfile>("data", "profile"),
      call<Category[]>("data", "categories"),
      call<Tag[]>("data", "tags"),
    ])
    .then(([p, c, t]) => { setProfile(p); setCategories(c); setTags(t); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load profile"))
    .finally(() => setDataLoading(false));

    loadListings();
  }, []);

  return (
    <DashboardShell role="DONOR">
      <OverviewSection listings={listings} />
      <DonateHubSection
        profile={profile}
        categories={categories}
        tags={tags}
        onRefresh={loadListings}
      />
      <DonateDeliverySection
        categories={categories}
        tags={tags}
        onRefresh={loadListings}
      />
      <UnfitSection
        categories={categories}
        onRefresh={loadListings}
      />
      <MyDonationsSection
        listings={listings}
        routings={routings}
        loading={dataLoading && listings === null}
      />
    </DashboardShell>
  );
}
