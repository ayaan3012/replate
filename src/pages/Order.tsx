/**
 * /order — recipient dashboard
 *
 * Sections (ids match sidebar anchors):
 *   hubs-map  — AddressSearch prefilled, HubMap + HubList, hub filter
 *   find-food — feed grid with ordering, score ring, hub/delivery badge, claim dialog
 *   my-orders — claims table with delivery stepper / hub stepper + active pickup cards
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link }        from "react-router-dom";
import {
  Utensils, Package, Copy, Check, AlertCircle, Loader2, X,
  ShoppingBag, MapPin, ChevronRight, Clock, Star,
} from "lucide-react";
import {
  call, n,
  type RecipientProfile, type RecipientImpact,
  type FeedItem, type ClaimResponse, type Claim, type Hub,
} from "@/lib/api";
import { useToast }      from "@/context/ToastContext";
import DashboardShell    from "@/components/DashboardShell";
import HubMap            from "@/components/HubMap";
import HubList           from "@/components/HubList";
import AddressSearch     from "@/components/AddressSearch";

// ─── shared primitives ────────────────────────────────────────────────────────

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
    <div className="flex flex-col items-center gap-2 py-12 text-muted">
      <AlertCircle size={28} className="opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

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
      className="inline-flex items-center gap-1.5 font-mono font-bold text-ink bg-border rounded px-2.5 py-1 text-sm hover:bg-pink-tint transition-colors"
      title="Copy code"
    >
      {value}
      {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
    </button>
  );
}

// ─── Dialog shell ─────────────────────────────────────────────────────────────

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal
        className="relative w-full max-w-md rounded-xl bg-white border border-border shadow-lg p-6 focus:outline-none"
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

// ─── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const pct  = Math.min(100, Math.max(0, score));
  const r    = 14;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? "var(--color-success)" : pct >= 40 ? "var(--color-blue)" : "var(--color-muted)";

  return (
    <svg width={36} height={36} viewBox="0 0 36 36" className="shrink-0">
      <circle cx={18} cy={18} r={r} fill="none" stroke="var(--color-border)" strokeWidth={3} />
      <circle
        cx={18} cy={18} r={r} fill="none"
        stroke={color} strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x={18} y={22} textAnchor="middle" fontSize={9} fontWeight={700} fill={color}>
        {Math.round(pct)}
      </text>
    </svg>
  );
}

// ─── Hub pickup code dialog ────────────────────────────────────────────────────

function PickupCodeDialog({ result, onClose }: { result: ClaimResponse; onClose: () => void }) {
  return (
    <Dialog title="Your order is confirmed!" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-success-tint border border-success p-4 text-sm text-ink">
          <p className="font-semibold text-success mb-2">Hub pickup</p>
          <p><span className="text-muted">Hub: </span><strong>{result.hub_name}</strong></p>
          <p><span className="text-muted">Compartment: </span><strong>{result.compartment}</strong></p>
          <p className="mt-3 text-xs font-semibold text-ink">Your pickup code:</p>
          <div className="mt-1.5">
            <CopyChip value={result.pickup_code!} />
          </div>
        </div>
        <p className="text-xs text-muted bg-pink-tint rounded px-3 py-2">
          Keep this code private. Only you can open the compartment.
        </p>
        <button onClick={onClose} className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110">
          Got it
        </button>
      </div>
    </Dialog>
  );
}

// ─── Section 1: Hubs map ──────────────────────────────────────────────────────

interface HubsSectionProps {
  profile:      RecipientProfile | null;
  filterHubId:  number | null;
  onFilter:     (id: number | null) => void;
}

function HubsMapSection({ profile, filterHubId, onFilter }: HubsSectionProps) {
  const [hubs,        setHubs]        = useState<Hub[]>([]);
  const [allHubs,     setAllHubs]     = useState<Hub[]>([]);
  const [loadingHubs, setLoadingHubs] = useState(true);
  const [userLoc,     setUserLoc]     = useState<{ lat: number; lng: number } | null>(null);
  const [selectedId,  setSelectedId]  = useState<number | null>(null);
  const [prefill,     setPrefill]     = useState("");
  const { toast } = useToast();

  // Prefill address from profile
  useEffect(() => {
    if (profile) {
      setPrefill(profile.address);
      setUserLoc({ lat: n(profile.latitude), lng: n(profile.longitude) });
    }
  }, [profile]);

  // Load all hubs for the map background
  useEffect(() => {
    call<Hub[]>("hubs", "list")
      .then(h => { setAllHubs(h); setHubs(h); })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load hubs"))
      .finally(() => setLoadingHubs(false));
  }, []);

  const handleSearchResult = (nearHubs: Hub[], coords: { lat: number; lng: number }) => {
    setHubs(nearHubs);
    setUserLoc(coords);
    // Highlight nearest hub automatically
    if (nearHubs.length > 0) setSelectedId(nearHubs[0].hub_id);
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
    onFilter(id);
  };

  return (
    <SectionWrap id="hubs-map" title="Hubs map">
      <AddressSearch
        prefill={prefill}
        onResult={handleSearchResult}
      />

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-lg overflow-hidden border border-border">
          {loadingHubs
            ? <Skeleton className="h-full w-full" />
            : <HubMap
                hubs={hubs.length > 0 ? hubs : allHubs}
                userLocation={userLoc}
                selectedHubId={selectedId}
                onSelect={handleSelect}
              />
          }
        </div>
        <div className="overflow-y-auto max-h-72">
          {loadingHubs
            ? <Skeleton className="h-24 w-full" />
            : <HubList
                hubs={hubs.length > 0 ? hubs : allHubs}
                selectedHubId={selectedId}
                onSelect={handleSelect}
              />
          }
        </div>
      </div>

      {filterHubId && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-muted">
            Showing food from: <strong className="text-ink">
              {[...hubs, ...allHubs].find(h => h.hub_id === filterHubId)?.name ?? "selected hub"}
            </strong>
          </span>
          <button
            onClick={() => { onFilter(null); setSelectedId(null); }}
            className="text-pink font-semibold hover:underline"
          >
            Show all food
          </button>
        </div>
      )}
    </SectionWrap>
  );
}

// ─── Section 2: Find food ─────────────────────────────────────────────────────

interface FindFoodSectionProps {
  filterHubId: number | null;
  onRefresh:   () => void;
}

function FindFoodSection({ filterHubId, onRefresh }: FindFoodSectionProps) {
  const [feed,    setFeed]    = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [qtys,    setQtys]    = useState<Record<number, number>>({});
  const [claimResult, setClaimResult] = useState<ClaimResponse | null>(null);
  const [busyId,  setBusyId]  = useState<number | null>(null);
  const { toast } = useToast();

  const loadFeed = () => {
    setLoading(true);
    // call() constructs /api/data?a=feed — for hub_id we fetch directly
    const url = filterHubId
      ? `/api/data?a=feed&hub_id=${filterHubId}`
      : `/api/data?a=feed`;
    fetch(url, { credentials: "include" })
      .then(r => r.json())
      .then((items: FeedItem[]) => {
        if (!Array.isArray(items)) throw new Error((items as { error?: string }).error ?? "Unexpected response");
        setFeed(items);
        const init: Record<number, number> = {};
        items.forEach(i => { init[i.listing_id] = 1; });
        setQtys(init);
      })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load food feed"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFeed(); }, [filterHubId]);

  const setQty = (id: number, val: number, max: number) =>
    setQtys(prev => ({ ...prev, [id]: Math.min(max, Math.max(1, val)) }));

  const handleClaim = async (item: FeedItem) => {
    setBusyId(item.listing_id);
    try {
      const res = await call<ClaimResponse>("data", "claim", {
        listing_id: item.listing_id,
        qty: qtys[item.listing_id] ?? 1,
      });
      if (res.pickup_code) {
        setClaimResult(res);
      } else {
        toast("Order placed — a volunteer will deliver it.", "success");
      }
      loadFeed();
      onRefresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not place order");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SectionWrap id="find-food" title="Find food">
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : feed.length === 0 ? (
        <EmptyState message={filterHubId ? "No food available at this hub right now." : "No food available right now. Check back soon."} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {feed.map(item => {
            const remaining = n(item.quantity_remaining);
            const hours     = (n(item.minutes_left) / 60);
            const score     = item.score !== null ? n(item.score) : null;
            const isHub     = item.hub_id !== null;
            const qty       = qtys[item.listing_id] ?? 1;
            const isBusy    = busyId === item.listing_id;
            const tagList   = (item.tags ?? "").split(",").map(t => t.trim()).filter(Boolean);

            return (
              <div
                key={item.listing_id}
                className="flex flex-col rounded-xl border border-border bg-white shadow-sm hover:shadow-md transition-shadow p-4"
              >
                {/* Top row: name + score */}
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-ink truncate">{item.food_name}</p>
                    <p className="text-xs text-muted truncate">{item.donor_name}</p>
                  </div>
                  {score !== null && <ScoreRing score={score} />}
                </div>

                {/* Tags */}
                {tagList.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {tagList.map(t => (
                      <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-blue-tint text-blue font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Package size={11} className="text-pink" />
                    <strong className="text-ink">{remaining}</strong> {item.quantity_unit} left
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={11} />
                    {hours < 1 ? `${Math.round(n(item.minutes_left))} min` : `${hours.toFixed(1)} h`}
                  </span>
                </div>

                {/* Hub / delivery badge */}
                <span className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${
                  isHub
                    ? "bg-pink-tint text-pink"
                    : "bg-blue-tint text-blue"
                }`}>
                  {isHub ? `Hub pickup · ${item.hub_name}` : "Volunteer delivery"}
                </span>

                {/* Quantity counter + Order */}
                <div className="mt-auto flex items-center gap-2">
                  <div className="flex items-center border border-border rounded overflow-hidden">
                    <button
                      onClick={() => setQty(item.listing_id, qty - 1, remaining)}
                      className="px-2.5 py-1.5 text-muted hover:bg-border text-sm font-bold"
                    >−</button>
                    <input
                      type="number"
                      value={qty}
                      min={1}
                      max={remaining}
                      onChange={e => setQty(item.listing_id, Number(e.target.value), remaining)}
                      className="w-10 text-center text-sm font-semibold text-ink border-x border-border py-1.5 focus:outline-none"
                    />
                    <button
                      onClick={() => setQty(item.listing_id, qty + 1, remaining)}
                      className="px-2.5 py-1.5 text-muted hover:bg-border text-sm font-bold"
                    >+</button>
                  </div>

                  <button
                    onClick={() => handleClaim(item)}
                    disabled={isBusy || remaining < 1}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-pink text-white text-xs font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
                  >
                    {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ShoppingBag size={12} />}
                    {isBusy ? "Ordering…" : "Order"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {claimResult && claimResult.pickup_code && (
        <PickupCodeDialog
          result={claimResult}
          onClose={() => setClaimResult(null)}
        />
      )}
    </SectionWrap>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

const DELIVERY_STEPS = ["Claimed", "Volunteer assigned", "In transit", "Delivered"];
const HUB_STEPS      = ["Claimed", "Dropped at hub", "Collected"];

function getDeliveryStep(c: Claim): number {
  if (c.pickup_status === "DELIVERED") return 3;
  if (c.pickup_status === "IN_TRANSIT") return 2;
  if (c.pickup_status && c.pickup_status !== "CANCELLED" && c.pickup_status !== "FAILED") return 1;
  return 0;
}

function getHubStep(c: Claim): number {
  if (c.handover_status === "COLLECTED") return 2;
  if (c.handover_status === "DROPPED")   return 1;
  return 0;
}

function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-0 mt-2">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-0 flex-1 min-w-0">
          <div className="flex flex-col items-center shrink-0">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              i < current  ? "bg-success text-white"
              : i === current ? "bg-pink text-white"
              : "bg-border text-muted"
            }`}>
              {i < current ? <Check size={10} /> : i + 1}
            </div>
            <span className="text-[10px] text-muted mt-0.5 text-center leading-tight max-w-[56px]">
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-0.5 mb-3 ${i < current ? "bg-success" : "bg-border"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Section 3: My orders ─────────────────────────────────────────────────────

interface MyOrdersSectionProps {
  claims:  Claim[] | null;
  loading: boolean;
  impact:  RecipientImpact | null;
}

function MyOrdersSection({ claims, loading, impact }: MyOrdersSectionProps) {
  // Active hub claims needing attention (AWAITING_DROP or DROPPED)
  const activeHubClaims = (claims ?? []).filter(
    c => c.handover_id && (c.handover_status === "AWAITING_DROP" || c.handover_status === "DROPPED")
  );

  return (
    <SectionWrap id="my-orders" title="My orders">
      {/* Impact stat cards */}
      {impact && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Claims completed", value: impact.claims_completed },
            { label: "Kg received",      value: n(impact.kg_received).toFixed(1) },
            { label: "Meals received",   value: n(impact.meals_received).toFixed(0) },
          ].map(s => (
            <div key={s.label} className="rounded-lg border border-border bg-white p-4 shadow-sm text-center">
              <p className="text-xl font-bold text-ink">{s.value}</p>
              <p className="text-xs text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Active hub pickup cards */}
      {activeHubClaims.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-ink mb-3">Waiting for you to collect:</p>
          <div className="flex flex-col gap-3">
            {activeHubClaims.map(c => (
              <div key={c.claim_id} className="rounded-xl border-2 border-pink bg-pink-tint p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-sm text-ink">{c.food_name}</p>
                    <p className="text-xs text-muted">Order #{c.claim_id} · {c.hub_name}</p>
                    <p className="text-xs text-muted">Compartment: <strong className="text-ink">{c.compartment_label}</strong></p>
                  </div>
                  {c.handover_status === "AWAITING_DROP" && (
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-tint text-blue">
                      Not dropped yet
                    </span>
                  )}
                  {c.handover_status === "DROPPED" && (
                    <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-success-tint text-success">
                      Ready to collect!
                    </span>
                  )}
                </div>

                {c.pickup_code && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs text-muted">Pickup code:</span>
                    <CopyChip value={c.pickup_code} />
                  </div>
                )}

                <Link
                  to="/hub"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-pink hover:underline"
                >
                  <MapPin size={11} />
                  Go to Hub Screen
                  <ChevronRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !claims?.length ? (
        <EmptyState message="No orders yet. Browse the food feed to order." />
      ) : (
        <div className="flex flex-col gap-4">
          {claims.map(c => {
            const isHub = c.handover_id !== null;
            const steps = isHub ? HUB_STEPS : DELIVERY_STEPS;
            const cur   = isHub ? getHubStep(c) : getDeliveryStep(c);

            return (
              <div key={c.claim_id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-ink truncate">{c.food_name}</p>
                    <p className="text-xs text-muted">
                      #{c.claim_id} · {c.quantity_claimed} {isHub ? "· " + (c.hub_name ?? "") : ""}
                      {c.volunteer_name ? ` · ${c.volunteer_name}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isHub ? "bg-pink-tint text-pink" : "bg-blue-tint text-blue"
                  }`}>
                    {isHub ? "Hub pickup" : "Delivery"}
                  </span>
                </div>

                <Stepper steps={steps} current={cur} />
              </div>
            );
          })}
        </div>
      )}
    </SectionWrap>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────

export default function Order() {
  const { toast } = useToast();

  const [profile,    setProfile]    = useState<RecipientProfile | null>(null);
  const [claims,     setClaims]     = useState<Claim[] | null>(null);
  const [impact,     setImpact]     = useState<RecipientImpact | null>(null);
  const [claimsLoading, setClaimsLoading] = useState(true);
  const [filterHubId, setFilterHubId]    = useState<number | null>(null);

  const loadClaims = () =>
    Promise.all([
      call<Claim[]>("data", "myClaims"),
      call<RecipientImpact>("data", "myImpact"),
    ])
    .then(([cs, imp]) => { setClaims(cs); setImpact(imp); })
    .catch(err => toast(err instanceof Error ? err.message : "Could not load orders"))
    .finally(() => setClaimsLoading(false));

  useEffect(() => {
    call<RecipientProfile>("data", "profile")
      .then(setProfile)
      .catch(err => toast(err instanceof Error ? err.message : "Could not load profile"));

    loadClaims();
  }, []);

  return (
    <DashboardShell role="RECIPIENT">
      <HubsMapSection
        profile={profile}
        filterHubId={filterHubId}
        onFilter={setFilterHubId}
      />
      <FindFoodSection
        filterHubId={filterHubId}
        onRefresh={loadClaims}
      />
      <MyOrdersSection
        claims={claims}
        loading={claimsLoading}
        impact={impact}
      />
    </DashboardShell>
  );
}
