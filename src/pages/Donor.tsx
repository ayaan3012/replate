/**
 * /donor — full donor dashboard
 *
 * Sections (ids match sidebar anchors):
 *   overview        — impact stat cards + listing counts
 *   donate-hub      — toolbar + address search + HubMap + HubList + "Donate here" dialog
 *   donate-delivery — dialog: food fields + sealed checkbox, no hub
 *   unfit-food      — dialog: category/name/qty + animal vs biogas grade
 *   my-donations    — tabs: Listings table (with handover expand) + Rerouted waste
 */
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Utensils, Leaf, Wind, Copy, Check, ChevronDown, ChevronUp,
  Loader2, X, AlertCircle, CheckCircle, MapPin, LocateFixed, Snowflake,
} from "lucide-react";
import { call, n, type Category, type Tag, type DonorProfile,
         type DonorImpact, type Listing, type Routing, type Hub,
         type ReportUnfitResponse } from "@/lib/api";
import { useAuth }  from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import DashboardShell from "@/components/DashboardShell";
import HubMap         from "@/components/HubMap";
import HubList        from "@/components/HubList";

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
    AVAILABLE:    "bg-success-tint text-success",
    APPROVED:     "bg-success-tint text-success",
    COMPLETED:    "bg-success-tint text-success",
    COLLECTED:    "bg-success-tint text-success",
    DROPPED:      "bg-success-tint text-success",
    PENDING:      "bg-blue-tint text-blue",
    AWAITING_DROP:"bg-blue-tint text-blue",
    SCHEDULED:    "bg-blue-tint text-blue",
    ROUTED:       "bg-pink-tint text-pink",
    IN_TRANSIT:   "bg-pink-tint text-pink",
    EXPIRED:      "bg-error-tint text-error",
    CANCELLED:    "bg-error-tint text-error",
    REJECTED:     "bg-error-tint text-error",
    LOCKED:       "bg-error-tint text-error",
  };
  const cls = map[status] ?? "bg-border text-ink";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ─── CopyChip ─────────────────────────────────────────────────────────────────

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 font-mono font-bold text-ink bg-border rounded px-2.5 py-1 text-sm hover:bg-pink-tint transition-colors"
      title="Copy code"
    >
      {value}
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

// ─── ConfirmationCard ─────────────────────────────────────────────────────────

interface ConfirmationCardProps {
  heading:     string;
  rows:        { label: string; value: string }[];
  buttonLabel: string;
  onClose:     () => void;
}
function ConfirmationCard({ heading, rows, buttonLabel, onClose }: ConfirmationCardProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-lg p-8 flex flex-col gap-4">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-success-tint flex items-center justify-center">
            <CheckCircle size={28} className="text-success" />
          </div>
        </div>
        <p className="text-center text-xl font-bold text-ink">{heading}</p>
        <div className="flex flex-col gap-2 text-sm divide-y divide-border">
          {rows.map(r => (
            <div key={r.label} className="flex justify-between pt-2 first:pt-0">
              <span className="text-muted">{r.label}</span>
              <span className="text-ink font-medium">{r.value}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 transition-all"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Dialog shell ─────────────────────────────────────────────────────────────

interface DialogProps { title: string; onClose: () => void; children: ReactNode }
function Dialog({ title, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = ref.current?.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
      ) ?? ([] as HTMLElement[]);
      const els = Array.from(focusable);
      if (els.length === 0) return;
      const first = els[0];
      const last  = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keydown", trapFocus);
    // focus the first focusable element inside
    const firstEl = ref.current?.querySelector<HTMLElement>(
      'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])'
    );
    (firstEl ?? ref.current)?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", trapFocus);
    };
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
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-card border border-border shadow-lg p-6 focus:outline-none"
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

const inputCls  = "mt-0.5 w-full px-3 py-2 rounded border border-border bg-card text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pink transition-colors";
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
  storageOptions: StorageOpt[];
  hubId:          number | null;
  onSuccess:      (id: number) => void;
  onClose:        () => void;
}

function ListingForm({ categories, tags, storageOptions, hubId, onSuccess, onClose }: ListingFormProps) {
  const { toast } = useToast();
  const [busy,      setBusy]      = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dietTags     = tags.filter(t => t.type === "DIET");
  const allergenTags = tags.filter(t => t.type === "ALLERGEN");

  const [allergenMap,  setAllergenMap]  = useState<Record<number, "contains" | "free" | "unsure">>({});
  const [selectedDiet, setSelectedDiet] = useState<Set<number>>(new Set());

  const toggleDiet = (id: number) =>
    setSelectedDiet(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    const fd  = new FormData(e.currentTarget);
    const get = (k: string) => fd.get(k) as string;

    const foodName = get("food_name").trim();
    const qty      = Number(get("qty"));
    const weight   = Number(get("weight"));
    const hours    = Number(get("hours"));
    const catId    = Number(get("category_id"));

    // Client-side validation
    if (!foodName)                          { setFormError("Food name is required"); return; }
    if (!catId)                             { setFormError("Category is required"); return; }
    if (!Number.isFinite(qty) || qty <= 0)  { setFormError("Quantity must be a positive number"); return; }
    if (!Number.isFinite(weight) || weight <= 0) { setFormError("Kg per unit must be positive"); return; }
    if (!Number.isFinite(hours) || hours <= 0)   { setFormError("Expiry hours must be positive"); return; }

    const allergens = allergenTags
      .map(t => ({ tag_id: t.id, val: allergenMap[t.id] ?? "unsure" }))
      .filter(a => a.val !== "unsure")
      .map(a => ({ tag_id: a.tag_id, contains: a.val === "contains" }));

    setBusy(true);
    try {
      const res = await call<{ id: number }>("data", "addListing", {
        category_id: catId,
        food_name:   foodName,
        qty,
        unit:        get("unit"),
        weight,
        hours,
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
      const msg = err instanceof Error ? err.message : "Could not publish listing";
      toast(msg);
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {hubId && (
        <p className="text-xs font-semibold text-pink bg-pink-tint rounded px-3 py-2">
          Hub donations must be sealed. Storage options are limited to what this hub supports.
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

      {formError && (
        <p role="alert" className="text-xs text-error bg-error-tint rounded px-3 py-2">
          {formError}
        </p>
      )}

      <SubmitBtn loading={busy}>Publish listing</SubmitBtn>
    </form>
  );
}

// ─── Section 1: Overview ──────────────────────────────────────────────────────

function OverviewSection({ listings }: { listings: Listing[] | null }) {
  const [impact,  setImpact]  = useState<DonorImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    call<DonorImpact>("data", "myImpact")
      .then(setImpact)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load impact"))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = impact
    ? [
        { label: "Meals saved",  value: n(impact.meals_saved).toFixed(0),          Icon: Utensils, color: "text-pink" },
        { label: "Kg diverted",  value: n(impact.kg_diverted).toFixed(1),          Icon: Leaf,     color: "text-success" },
        { label: "CO₂ avoided",  value: `${n(impact.co2_avoided_kg).toFixed(1)} kg`, Icon: Wind,   color: "text-blue" },
      ]
    : [];

  const available = listings?.filter(l => l.status === "AVAILABLE" || l.status === "PENDING").length ?? 0;
  const total     = listings?.length ?? 0;

  return (
    <SectionWrap id="overview" title="Overview">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
          : stats.map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-5 shadow-sm">
                <s.Icon size={20} className={`mb-2 ${s.color}`} />
                <p className="text-2xl font-bold text-ink">{s.value}</p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
              </div>
            ))
        }
        {/* listing counts */}
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <p className="text-2xl font-bold text-ink">{listings === null ? "—" : available}</p>
          <p className="text-xs text-muted mt-0.5">Active listings</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
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
  const [displayHubs, setDisplayHubs] = useState<Hub[]>([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [userLoc,     setUserLoc]     = useState<{ lat: number; lng: number } | null>(null);
  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [confirmedId, setConfirmedId] = useState<number | null>(null);
  const [confirmedHub, setConfirmedHub] = useState<string>("");

  const [coldOnly,     setColdOnly]     = useState(false);
  const [addressQuery, setAddressQuery] = useState("");
  const [searchBusy,   setSearchBusy]   = useState(false);
  const [locateBusy,   setLocateBusy]   = useState(false);
  const [nearestBusy,  setNearestBusy]  = useState(false);

  const { toast } = useToast();

  // Default user location from profile
  useEffect(() => {
    if (profile) {
      setAddressQuery(profile.address ?? "");
      const lat = n(profile.latitude);
      const lng = n(profile.longitude);
      if (lat !== 0 || lng !== 0) setUserLoc({ lat, lng });
    }
  }, [profile]);

  // Load all hubs on mount
  useEffect(() => {
    fetch("/api/hubs?a=list", { credentials: "include" })
      .then(r => r.json())
      .then((h: Hub[]) => { setHubs(h); setDisplayHubs(h); })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load hubs"))
      .finally(() => setLoadingHubs(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleHubs = coldOnly
    ? displayHubs.filter(h => h.compartments.some(c => c.temp_controlled))
    : displayHubs;

  const selectedHub = hubs.find(h => h.hub_id === selectedId) ?? displayHubs.find(h => h.hub_id === selectedId) ?? null;

  // Determine storage options from the selected hub's compartments
  const storageOptions: ("AMBIENT" | "REFRIGERATED")[] = selectedHub
    ? [
        ...(selectedHub.compartments.some(c => !c.temp_controlled) ? ["AMBIENT" as const] : []),
        ...(selectedHub.compartments.some(c =>  c.temp_controlled) ? ["REFRIGERATED" as const] : []),
      ]
    : ["AMBIENT", "REFRIGERATED"];

  const doSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearchBusy(true);
    try {
      const geoRes = await fetch(`/api/geo?a=geocode&q=${encodeURIComponent(trimmed)}`, { credentials: "include" });
      if (geoRes.status === 404) { toast("Address not found"); return; }
      if (!geoRes.ok) throw new Error(`Geocode error ${geoRes.status}`);
      const geo: { lat: number; lng: number } = await geoRes.json();

      const hubRes = await fetch(`/api/hubs?a=nearest&lat=${geo.lat}&lng=${geo.lng}`, { credentials: "include" });
      if (!hubRes.ok) throw new Error(`Hubs error ${hubRes.status}`);
      const nearHubs: Hub[] = await hubRes.json();

      setUserLoc(geo);
      setDisplayHubs(nearHubs);
      if (nearHubs.length > 0) setSelectedId(nearHubs[0].hub_id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearchBusy(false);
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) { toast("Geolocation not supported by your browser"); return; }
    setLocateBusy(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLoc({ lat, lng });
        try {
          const res = await fetch(`/api/hubs?a=nearest&lat=${lat}&lng=${lng}`, { credentials: "include" });
          if (!res.ok) throw new Error("Could not load nearest hubs");
          const nearHubs: Hub[] = await res.json();
          setDisplayHubs(nearHubs);
          if (nearHubs.length > 0) setSelectedId(nearHubs[0].hub_id);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Could not load nearest hubs");
        } finally {
          setLocateBusy(false);
        }
      },
      () => {
        setLocateBusy(false);
        toast("Location access denied — enter an address instead", "info" as Parameters<ReturnType<typeof useToast>["toast"]>[1]);
      },
      { timeout: 10000 },
    );
  };

  const handleNearestHub = async () => {
    if (!profile?.address) { toast("Profile address not loaded yet"); return; }
    setNearestBusy(true);
    try {
      const geoRes = await fetch(`/api/geo?a=geocode&q=${encodeURIComponent(profile.address)}`, { credentials: "include" });
      if (!geoRes.ok) throw new Error("Could not geocode your address");
      const geo: { lat: number; lng: number } = await geoRes.json();

      const hubRes = await fetch(`/api/hubs?a=nearest&lat=${geo.lat}&lng=${geo.lng}`, { credentials: "include" });
      if (!hubRes.ok) throw new Error("Could not load nearest hubs");
      const nearHubs: Hub[] = await hubRes.json();

      setUserLoc(geo);
      setDisplayHubs(nearHubs);
      if (nearHubs.length > 0) setSelectedId(nearHubs[0].hub_id);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not find nearest hub");
    } finally {
      setNearestBusy(false);
    }
  };

  const handleListingSuccess = (id: number) => {
    setConfirmedId(id);
    setConfirmedHub(selectedHub?.name ?? "");
    setDialogOpen(false);
    onRefresh();
  };

  return (
    <SectionWrap id="donate-hub" title="Donate to a hub">

      {/* ConfirmationCard shown after successful listing */}
      {confirmedId !== null ? (
        <ConfirmationCard
          heading="Listing published!"
          rows={[
            { label: "Listing ID", value: String(confirmedId) },
            { label: "Hub",        value: confirmedHub },
          ]}
          buttonLabel="Done"
          onClose={() => setConfirmedId(null)}
        />
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <button
              onClick={handleLocateMe}
              disabled={locateBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-border bg-card text-ink hover:bg-border disabled:opacity-50 transition-colors"
            >
              {locateBusy ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
              Locate me
            </button>
            <button
              onClick={handleNearestHub}
              disabled={nearestBusy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-border bg-card text-ink hover:bg-border disabled:opacity-50 transition-colors"
            >
              {nearestBusy ? <Loader2 size={13} className="animate-spin" /> : <MapPin size={13} />}
              Nearest hub
            </button>
            <button
              onClick={() => setColdOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border transition-colors ${
                coldOnly ? "bg-blue-tint border-blue text-blue" : "bg-card border-border text-ink hover:bg-border"
              }`}
            >
              <Snowflake size={13} />
              Cold storage only
            </button>
          </div>

          {/* Address search */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                value={addressQuery}
                onChange={e => setAddressQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") doSearch(addressQuery); }}
                placeholder="Enter an address…"
                className="w-full pl-8 pr-3 py-2 rounded border border-border bg-card text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pink transition-colors"
              />
            </div>
            <button
              onClick={() => doSearch(addressQuery)}
              disabled={searchBusy || !addressQuery.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-pink text-white text-sm font-semibold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {searchBusy ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Map */}
            <div className="h-72 rounded-lg overflow-hidden border border-border">
              {loadingHubs
                ? <Skeleton className="h-full w-full" />
                : <HubMap
                    hubs={visibleHubs}
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
                : <HubList hubs={visibleHubs} selectedHubId={selectedId} onSelect={setSelectedId} />
              }
            </div>
          </div>

          {/* Donate here button */}
          {selectedHub && (
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm text-muted">
                Selected: <strong className="text-ink">{selectedHub.name}</strong>
              </span>
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
                onSuccess={handleListingSuccess}
                onClose={() => setDialogOpen(false)}
              />
            </Dialog>
          )}
        </>
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
  const [open,        setOpen]        = useState(false);
  const [confirmedId, setConfirmedId] = useState<number | null>(null);
  const ALL_STORAGE: StorageOpt[] = ["HOT", "AMBIENT", "REFRIGERATED"];

  const handleSuccess = (id: number) => {
    setConfirmedId(id);
    setOpen(false);
    onRefresh();
  };

  return (
    <SectionWrap id="donate-delivery" title="Donate for delivery">
      {confirmedId !== null ? (
        <ConfirmationCard
          heading="Delivery listing created!"
          rows={[{ label: "Listing ID", value: String(confirmedId) }]}
          buttonLabel="Done"
          onClose={() => setConfirmedId(null)}
        />
      ) : (
        <>
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
                onSuccess={handleSuccess}
                onClose={() => setOpen(false)}
              />
            </Dialog>
          )}
        </>
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
  const [open,      setOpen]      = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [result,    setResult]    = useState<ReportUnfitResponse | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
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
      const msg = err instanceof Error ? err.message : "Could not report unfit food";
      toast(msg);
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => { setOpen(false); setResult(null); setFormError(null); };

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

      {/* ConfirmationCard outside the dialog to avoid double Escape handlers */}
      {result && (
        <div className="mt-6">
          <ConfirmationCard
            heading="Food routed"
            rows={[
              { label: "Partner",    value: result.partner_name },
              { label: "Route type", value: result.route_type },
              { label: "Weight",     value: `${n(result.kg).toFixed(2)} kg` },
            ]}
            buttonLabel="Done"
            onClose={handleClose}
          />
        </div>
      )}

      {open && !result && (
        <Dialog title="Food not fit for people" onClose={handleClose}>
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
                  {["plates","packets","kg","loaves"].map(u => <option key={u}>{u}</option>)}
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
                  { value: "ANIMAL_OK",   label: "Safe for animals (ANIMAL_OK)",  desc: "Goes to farms or animal shelters" },
                  { value: "BIOGAS_ONLY", label: "Only for biogas (BIOGAS_ONLY)",  desc: "Not safe for animals either" },
                ].map(opt => (
                  <label key={opt.value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="grade"
                      value={opt.value}
                      defaultChecked={opt.value === "ANIMAL_OK"}
                      className="mt-0.5 accent-[var(--color-pink)]"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                      <span className="block text-xs text-muted">{opt.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && (
              <p role="alert" className="text-xs text-error bg-error-tint rounded px-3 py-2">
                {formError}
              </p>
            )}

            <SubmitBtn loading={busy}>Route this food</SubmitBtn>
          </form>
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
              tab === t ? "bg-pink text-white" : "bg-card text-muted hover:text-ink"
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
                    const hasHandovers = l.hub_name !== null && l.handovers.length > 0;
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
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="text-muted">Drop code:</span>
                                    <CopyChip value={hv.drop_code} />
                                    <span className="text-muted italic">
                                      Type the order number and this code on the Hub screen
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
  // useAuth is imported but role guard is in the router; keep import for consistency
  void useAuth;

  const [profile,     setProfile]     = useState<DonorProfile | null>(null);
  const [categories,  setCategories]  = useState<Category[]>([]);
  const [tags,        setTags]        = useState<Tag[]>([]);
  const [listings,    setListings]    = useState<Listing[] | null>(null);
  const [routings,    setRoutings]    = useState<Routing[] | null>(null);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <DashboardShell role="DONOR" title="Donor dashboard" subtitle="List surplus food, track donations, and see your impact.">
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
