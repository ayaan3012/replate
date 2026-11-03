/**
 * /order — recipient dashboard
 *
 * Sections (ids match sidebar anchors):
 *   overview   — impact stat cards
 *   hubs-map   — Leaflet map with toolbar, address search, hub list
 *   find-food  — food list + basket panel + inline checkout + confirmation card
 *   my-orders  — claims table with steppers + active pickup cards
 */
import 'leaflet/dist/leaflet.css';
import React, {
  createContext, useContext,
  useState, useEffect, useCallback, useRef,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import {
  Utensils, ShoppingCart, Copy, Check, AlertCircle, Loader2, X,
  MapPin, LocateFixed, Snowflake, ChevronRight, Star,
  CheckCircle, Package,
} from 'lucide-react';
import {
  call, n,
  type RecipientProfile, type RecipientImpact,
  type FeedItem, type ClaimResponse, type Claim, type Hub,
} from '@/lib/api';
import { useToast }   from '@/context/ToastContext';
import DashboardShell from '@/components/DashboardShell';
import HubMap         from '@/components/HubMap';
import HubList        from '@/components/HubList';

// ─── Basket context ───────────────────────────────────────────────────────────

interface BasketItem { item: FeedItem; qty: number }
interface BasketCtx {
  basket:     Map<number, BasketItem>;
  addItem:    (item: FeedItem) => void;
  removeItem: (id: number) => void;
  setQty:     (id: number, qty: number) => void;
  clearItems: (ids: number[]) => void;
  totalCount: number;
}

const BasketContext = createContext<BasketCtx | null>(null);

export function useBasket(): BasketCtx {
  const ctx = useContext(BasketContext);
  if (!ctx) throw new Error('useBasket must be used inside <BasketProvider>');
  return ctx;
}

const BASKET_KEY = 'replate-basket';

function serializeBasket(m: Map<number, BasketItem>): string {
  return JSON.stringify([...m.entries()]);
}

function deserializeBasket(raw: string): Map<number, BasketItem> {
  try {
    const arr = JSON.parse(raw) as [number, BasketItem][];
    return new Map(arr);
  } catch {
    return new Map();
  }
}

function BasketProvider({ children }: { children: ReactNode }) {
  const [basket, setBasket] = useState<Map<number, BasketItem>>(() => {
    try {
      const raw = sessionStorage.getItem(BASKET_KEY);
      return raw ? deserializeBasket(raw) : new Map();
    } catch {
      return new Map();
    }
  });

  // Persist on every change
  useEffect(() => {
    try {
      sessionStorage.setItem(BASKET_KEY, serializeBasket(basket));
    } catch {
      /* ignore */
    }
  }, [basket]);

  const addItem = useCallback((item: FeedItem) => {
    setBasket(prev => {
      const next = new Map(prev);
      const existing = next.get(item.listing_id);
      const max = n(item.quantity_remaining);
      if (existing) {
        next.set(item.listing_id, { item, qty: Math.min(existing.qty + 1, max) });
      } else {
        next.set(item.listing_id, { item, qty: 1 });
      }
      return next;
    });
  }, []);

  const removeItem = useCallback((id: number) => {
    setBasket(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const setQty = useCallback((id: number, qty: number) => {
    setBasket(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (!existing) return prev;
      const max = n(existing.item.quantity_remaining);
      const clamped = Math.min(max, Math.max(1, qty));
      next.set(id, { ...existing, qty: clamped });
      return next;
    });
  }, []);

  const clearItems = useCallback((ids: number[]) => {
    setBasket(prev => {
      const next = new Map(prev);
      ids.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const totalCount = [...basket.values()].reduce((s, bi) => s + bi.qty, 0);

  return (
    <BasketContext.Provider value={{ basket, addItem, removeItem, setQty, clearItems, totalCount }}>
      {children}
    </BasketContext.Provider>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
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

function CopyChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {/* ignore */});
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1.5 font-mono font-bold text-ink bg-border rounded px-2.5 py-1 text-sm hover:bg-pink-tint transition-colors"
      title="Copy code"
    >
      {code}
      {copied
        ? <Check size={12} className="text-success" />
        : <Copy size={12} />
      }
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    PENDING:   'bg-blue-tint text-blue',
    APPROVED:  'bg-success-tint text-success',
    REJECTED:  'bg-error-tint text-error',
    CANCELLED: 'bg-border text-muted',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[status] ?? 'bg-border text-ink'}`}>
      {status}
    </span>
  );
}

function Stepper({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <div className="flex items-start mt-2">
      {steps.map((label, i) => (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center shrink-0" style={{ minWidth: 0 }}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
              i < activeIndex  ? 'bg-success text-white'
              : i === activeIndex ? 'bg-pink text-white'
              : 'bg-border text-muted'
            }`}>
              {i < activeIndex ? <Check size={10} /> : i + 1}
            </div>
            <span className="text-[10px] text-muted mt-0.5 text-center leading-tight" style={{ maxWidth: 56 }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-0.5 mt-2.5 ${i < activeIndex ? 'bg-success' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  );
}

// ─── Section 1: Overview ──────────────────────────────────────────────────────

function OverviewSection() {
  const [impact,  setImpact]  = useState<RecipientImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    call<RecipientImpact>('data', 'myImpact')
      .then(setImpact)
      .catch(err => toast(err instanceof Error ? err.message : 'Could not load impact'))
      .finally(() => setLoading(false));
  }, []);

  const stats = impact
    ? [
        { label: 'Claims completed', value: String(impact.claims_completed) },
        { label: 'Kg received',      value: n(impact.kg_received).toFixed(1) },
        { label: 'Meals received',   value: n(impact.meals_received).toFixed(0) },
      ]
    : null;

  return (
    <section id="overview" className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))
          : (stats ?? [
              { label: 'Claims completed', value: '0' },
              { label: 'Kg received',      value: '0.0' },
              { label: 'Meals received',   value: '0' },
            ]).map(s => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-5 shadow-sm text-center">
                <p className="text-2xl font-bold text-ink">{s.value}</p>
                <p className="text-xs text-muted mt-1">{s.label}</p>
              </div>
            ))
        }
      </div>
    </section>
  );
}

// ─── Section 2: Hubs map ──────────────────────────────────────────────────────

interface HubsMapSectionProps {
  profile:      RecipientProfile | null;
  filterHubId:  number | null;
  setFilterHubId: (id: number | null) => void;
  allHubs:      Hub[];
  setAllHubs:   (hubs: Hub[]) => void;
}

function HubsMapSection({
  profile, filterHubId, setFilterHubId, allHubs, setAllHubs,
}: HubsMapSectionProps) {
  const [displayHubs,    setDisplayHubs]    = useState<Hub[]>([]);
  const [loadingHubs,    setLoadingHubs]    = useState(true);
  const [userLoc,        setUserLoc]        = useState<{ lat: number; lng: number } | null>(null);
  const [selectedHubId,  setSelectedHubId]  = useState<number | null>(null);
  const [coldOnly,       setColdOnly]       = useState(false);
  const [addressQuery,   setAddressQuery]   = useState('');
  const [searchBusy,     setSearchBusy]     = useState(false);
  const [locateBusy,     setLocateBusy]     = useState(false);
  const [nearestBusy,    setNearestBusy]    = useState(false);
  const { toast } = useToast();

  // Prefill address from profile
  useEffect(() => {
    if (profile) {
      setAddressQuery(profile.address ?? '');
      const lat = n(profile.latitude);
      const lng = n(profile.longitude);
      if (lat !== 0 || lng !== 0) setUserLoc({ lat, lng });
    }
  }, [profile]);

  // Load all hubs once
  useEffect(() => {
    fetch('/api/hubs?a=list', { credentials: 'include' })
      .then(r => r.json())
      .then((hubs: Hub[]) => {
        setAllHubs(hubs);
        setDisplayHubs(hubs);
      })
      .catch(err => toast(err instanceof Error ? err.message : 'Could not load hubs'))
      .finally(() => setLoadingHubs(false));
  }, []);

  // Apply cold-only filter to display
  const visibleHubs = coldOnly
    ? displayHubs.filter(h => h.compartments.some(c => c.temp_controlled))
    : displayHubs;

  const handleSelect = (id: number) => {
    setSelectedHubId(id);
    setFilterHubId(id);
  };

  const doSearch = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearchBusy(true);
    try {
      const geoRes = await fetch(`/api/geo?a=geocode&q=${encodeURIComponent(trimmed)}`, { credentials: 'include' });
      if (geoRes.status === 404) { toast('Address not found'); return; }
      if (!geoRes.ok) throw new Error(`Geocode error ${geoRes.status}`);
      const geo: { lat: number; lng: number } = await geoRes.json();

      const hubRes = await fetch(`/api/hubs?a=nearest&lat=${geo.lat}&lng=${geo.lng}`, { credentials: 'include' });
      if (!hubRes.ok) throw new Error(`Hubs error ${hubRes.status}`);
      const hubs: Hub[] = await hubRes.json();

      setUserLoc(geo);
      setDisplayHubs(hubs);
      if (hubs.length > 0) {
        setSelectedHubId(hubs[0].hub_id);
        setFilterHubId(hubs[0].hub_id);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchBusy(false);
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) { toast('Geolocation not supported by your browser'); return; }
    setLocateBusy(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLoc({ lat, lng });
        try {
          const res = await fetch(`/api/hubs?a=nearest&lat=${lat}&lng=${lng}`, { credentials: 'include' });
          if (!res.ok) throw new Error('Could not load nearest hubs');
          const hubs: Hub[] = await res.json();
          setDisplayHubs(hubs);
          if (hubs.length > 0) {
            setSelectedHubId(hubs[0].hub_id);
            setFilterHubId(hubs[0].hub_id);
          }
        } catch (err) {
          toast(err instanceof Error ? err.message : 'Could not load nearest hubs');
        } finally {
          setLocateBusy(false);
        }
      },
      () => {
        setLocateBusy(false);
        toast('Location access denied — enter an address instead', 'info' as Parameters<ReturnType<typeof useToast>['toast']>[1]);
      },
      { timeout: 10000 },
    );
  };

  const handleNearestHub = async () => {
    if (!profile?.address) { toast('Profile address not loaded yet'); return; }
    setNearestBusy(true);
    try {
      const geoRes = await fetch(`/api/geo?a=geocode&q=${encodeURIComponent(profile.address)}`, { credentials: 'include' });
      if (!geoRes.ok) throw new Error('Could not geocode your address');
      const geo: { lat: number; lng: number } = await geoRes.json();

      const hubRes = await fetch(`/api/hubs?a=nearest&lat=${geo.lat}&lng=${geo.lng}`, { credentials: 'include' });
      if (!hubRes.ok) throw new Error('Could not load nearest hubs');
      const hubs: Hub[] = await hubRes.json();

      setUserLoc(geo);
      setDisplayHubs(hubs);
      if (hubs.length > 0) {
        setSelectedHubId(hubs[0].hub_id);
        setFilterHubId(hubs[0].hub_id);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not find nearest hub');
    } finally {
      setNearestBusy(false);
    }
  };

  const selectedHubName = [...displayHubs, ...allHubs].find(h => h.hub_id === filterHubId)?.name;

  return (
    <section id="hubs-map" className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">Hubs map</h2>

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
            coldOnly
              ? 'bg-blue-tint border-blue text-blue'
              : 'bg-card border-border text-ink hover:bg-border'
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
            onKeyDown={e => { if (e.key === 'Enter') doSearch(addressQuery); }}
            placeholder="Enter an address…"
            className="w-full pl-8 pr-3 py-2 rounded border border-border bg-card text-sm text-ink placeholder:text-muted focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow"
          />
        </div>
        <button
          onClick={() => doSearch(addressQuery)}
          disabled={searchBusy || !addressQuery.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded bg-pink text-white text-sm font-semibold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
        >
          {searchBusy ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
          {searchBusy ? 'Searching…' : 'Search'}
        </button>
      </div>

      {/* Map + list */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-lg overflow-hidden border border-border">
          {loadingHubs
            ? <Skeleton className="h-full w-full" />
            : <HubMap
                hubs={visibleHubs}
                userLocation={userLoc}
                selectedHubId={selectedHubId}
                onSelect={handleSelect}
              />
          }
        </div>
        <div className="overflow-y-auto max-h-72">
          {loadingHubs
            ? <Skeleton className="h-24 w-full" />
            : <HubList
                hubs={visibleHubs}
                selectedHubId={selectedHubId}
                onSelect={handleSelect}
              />
          }
        </div>
      </div>

      {/* Active filter pill */}
      {filterHubId && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">
            Showing food from:{' '}
            <strong className="text-ink">{selectedHubName ?? 'selected hub'}</strong>
          </span>
          <button
            onClick={() => { setFilterHubId(null); setSelectedHubId(null); }}
            className="text-pink font-semibold hover:underline"
          >
            Show all food
          </button>
        </div>
      )}
    </section>
  );
}

// ─── Section 3: Find food + basket + checkout ─────────────────────────────────

interface ClaimProgress {
  listing_id: number;
  food_name:  string;
  qty:        number;
  status:     'pending' | 'loading' | 'success' | 'error';
  error?:     string;
  result?:    ClaimResponse;
}

interface ConfirmationData {
  claimedAt:   Date;
  totalUnits:  number;
  items:       ClaimProgress[];
}

interface FindFoodSectionProps {
  filterHubId:    number | null;
  setFilterHubId: (id: number | null) => void;
  allHubs:        Hub[];
  reloadOrders:   () => void;
}

function FindFoodSection({ filterHubId, setFilterHubId, allHubs, reloadOrders }: FindFoodSectionProps) {
  const { basket, addItem, removeItem, setQty, clearItems, totalCount } = useBasket();
  const [feed,         setFeed]         = useState<FeedItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [checkingOut,  setCheckingOut]  = useState(false);
  const [progress,     setProgress]     = useState<ClaimProgress[]>([]);
  const [confirmation, setConfirmation] = useState<ConfirmationData | null>(null);
  const { toast } = useToast();

  const loadFeed = useCallback(() => {
    setLoading(true);
    const url = filterHubId
      ? `/api/data?a=feed&hub_id=${filterHubId}`
      : `/api/data?a=feed`;
    fetch(url, { credentials: 'include' })
      .then(r => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) {
          throw new Error((data as { error?: string }).error ?? 'Unexpected response');
        }
        setFeed(data as FeedItem[]);
      })
      .catch(err => toast(err instanceof Error ? err.message : 'Could not load food feed'))
      .finally(() => setLoading(false));
  }, [filterHubId]);

  useEffect(() => { loadFeed(); }, [loadFeed]);

  const handleCheckout = async () => {
    if (basket.size === 0) return;
    const items = [...basket.values()];
    const initial: ClaimProgress[] = items.map(bi => ({
      listing_id: bi.item.listing_id,
      food_name:  bi.item.food_name,
      qty:        bi.qty,
      status:     'pending',
    }));
    setProgress(initial);
    setCheckingOut(true);

    const successIds: number[] = [];
    const successItems: ClaimProgress[] = [];
    let totalUnits = 0;

    for (let i = 0; i < items.length; i++) {
      const bi = items[i];
      setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'loading' } : p));
      try {
        const res = await call<ClaimResponse>('data', 'claim', {
          listing_id: bi.item.listing_id,
          qty: bi.qty,
        });
        successIds.push(bi.item.listing_id);
        totalUnits += bi.qty;
        const claimed: ClaimProgress = {
          listing_id: bi.item.listing_id,
          food_name:  bi.item.food_name,
          qty:        bi.qty,
          status:     'success',
          result:     res,
        };
        successItems.push(claimed);
        setProgress(prev => prev.map((p, idx) => idx === i ? claimed : p));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not claim this item';
        setProgress(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'error', error: msg } : p));
      }
    }

    if (successIds.length > 0) {
      clearItems(successIds);
      reloadOrders();
      loadFeed();
    }

    setCheckingOut(false);

    if (successItems.length > 0) {
      setConfirmation({ claimedAt: new Date(), totalUnits, items: successItems });
    }
  };

  const handleGoToOrders = () => {
    setConfirmation(null);
    setProgress([]);
    document.getElementById('my-orders')?.scrollIntoView({ behavior: 'smooth' });
  };

  // Format minutes_left → "Xh Ym"
  const formatExpiry = (minutesLeft: string | number) => {
    const total = Number(minutesLeft);
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}m to expiry`;
    return `${h}h ${m}m to expiry`;
  };

  const basketEntries = [...basket.entries()];
  const isBasketEmpty = basket.size === 0;

  // ── Confirmation card ──────────────────────────────────────────────────────
  if (confirmation) {
    const now = confirmation.claimedAt;
    const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const hubItems  = confirmation.items.filter(it => it.result?.handover_id != null);
    const deliveryItems = confirmation.items.filter(it => it.result?.handover_id == null);

    return (
      <section id="find-food" className="scroll-mt-6 mb-14">
        <h2 className="text-lg font-bold text-ink mb-5">Find food</h2>
        <div className="flex justify-center">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card shadow-md p-6 flex flex-col gap-4">
            {/* Check circle */}
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-success-tint flex items-center justify-center">
                <CheckCircle size={32} className="text-success" />
              </div>
            </div>

            <p className="text-center text-xl font-bold text-ink">Your order has been placed</p>

            {/* Summary rows */}
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Date &amp; time</span>
                <span className="text-ink font-medium">{dateStr}, {timeStr}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Total units</span>
                <span className="text-ink font-medium">{confirmation.totalUnits}</span>
              </div>
            </div>

            {/* Hub claims */}
            {hubItems.map(it => it.result && (
              <div key={it.listing_id} className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Order #</span>
                  <span className="font-bold text-ink">{it.result.claim_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Method</span>
                  <span className="text-ink">Hub pickup</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Hub</span>
                  <span className="font-medium text-ink">{it.result.hub_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Compartment</span>
                  <span className="font-medium text-ink">{it.result.compartment}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-muted text-xs font-semibold">Your pickup code:</span>
                  <CopyChip code={it.result.pickup_code!} />
                </div>
                <p className="text-xs text-muted bg-pink-tint rounded px-2 py-1.5">
                  Keep this code private. Only you can open the compartment.
                </p>
              </div>
            ))}

            {/* Delivery claims */}
            {deliveryItems.map(it => it.result && (
              <div key={it.listing_id} className="rounded-lg border border-border bg-card p-3 text-sm">
                <p className="text-ink">
                  Order #{it.result.claim_id} — a volunteer will deliver.
                </p>
              </div>
            ))}

            <button
              onClick={handleGoToOrders}
              className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 transition-all"
            >
              Go to my orders
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ── Checkout progress ──────────────────────────────────────────────────────
  if (checkingOut && progress.length > 0) {
    return (
      <section id="find-food" className="scroll-mt-6 mb-14">
        <h2 className="text-lg font-bold text-ink mb-5">Find food</h2>
        <div className="rounded-xl border border-border bg-card shadow-sm p-6">
          <p className="text-sm font-semibold text-ink mb-4">Processing your order…</p>
          <div className="flex flex-col gap-3">
            {progress.map(p => (
              <div key={p.listing_id} className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 shrink-0 flex items-center justify-center">
                  {p.status === 'loading' && <Loader2 size={16} className="animate-spin text-blue" />}
                  {p.status === 'success' && <CheckCircle size={16} className="text-success" />}
                  {p.status === 'error'   && <X size={16} className="text-error" />}
                  {p.status === 'pending' && <div className="w-3 h-3 rounded-full bg-border" />}
                </div>
                <span className="flex-1 text-ink">{p.food_name} × {p.qty}</span>
                {p.status === 'error' && (
                  <span className="text-error text-xs">{p.error}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ── Post-checkout: show failures ──────────────────────────────────────────
  const hasFailures = progress.some(p => p.status === 'error');

  return (
    <section id="find-food" className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">Find food</h2>

      {hasFailures && (
        <div className="mb-4 rounded-lg border border-error bg-error-tint p-4 text-sm">
          <p className="font-semibold text-error mb-2">Some items could not be claimed:</p>
          {progress.filter(p => p.status === 'error').map(p => (
            <p key={p.listing_id} className="text-error text-xs">
              {p.food_name}: {p.error}
            </p>
          ))}
        </div>
      )}

      {/* Hub filter pill */}
      {filterHubId && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-pink-tint text-pink text-xs font-semibold px-3 py-1 rounded-full">
            <MapPin size={11} />
            {allHubs.find(h => h.hub_id === filterHubId)?.name ?? 'Selected hub'}
          </span>
          <button
            onClick={() => setFilterHubId(null)}
            className="text-pink font-semibold text-xs hover:underline"
          >
            Show all food
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-6">
        {/* Food list — ~60% */}
        <div className="flex-[3] flex flex-col gap-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)
            : feed.length === 0
              ? <EmptyState message={
                  filterHubId
                    ? 'No food available at this hub right now.'
                    : 'No food available right now. Check back soon.'
                } />
              : feed.map(item => {
                  const remaining = n(item.quantity_remaining);
                  const tags      = (item.tags ?? '').split(',').map(t => t.trim()).filter(Boolean);
                  const firstTag  = tags[0] ?? null;
                  const isHub     = item.hub_id !== null;
                  const score     = item.score !== null ? n(item.score) : null;

                  return (
                    <div
                      key={item.listing_id}
                      className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Icon tile */}
                      <div className="w-10 h-10 rounded-lg bg-pink-tint flex items-center justify-center shrink-0">
                        <Utensils size={18} className="text-pink" />
                      </div>

                      {/* Center info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-0.5">
                          <span className="font-bold text-sm text-ink truncate">{item.food_name}</span>
                          {firstTag && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-tint text-blue font-medium shrink-0">
                              {firstTag}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted truncate">
                          {item.donor_name} · {remaining} {item.quantity_unit} left · {formatExpiry(item.minutes_left)}
                        </p>
                      </div>

                      {/* Right badges + add button */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isHub ? 'bg-pink-tint text-pink' : 'bg-blue-tint text-blue'
                          }`}>
                            {isHub ? 'Hub pickup' : 'Volunteer delivery'}
                          </span>
                          {score !== null && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                              <Star size={10} className="inline -mt-0.5 mr-0.5" />
                              {Number(score).toFixed(0)}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => addItem(item)}
                          disabled={remaining < 1}
                          className="flex items-center gap-1 border border-pink text-pink rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-pink-tint disabled:opacity-40 transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  );
                })
          }
        </div>

        {/* Basket panel — ~40% */}
        <div className="flex-[2] min-w-0">
          <div className="sticky top-24 rounded-xl border border-border bg-card shadow-sm p-5">
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <ShoppingCart size={18} className="text-pink" />
              <h3 className="font-bold text-ink text-sm">Basket ({totalCount})</h3>
            </div>

            {isBasketEmpty ? (
              <p className="text-xs text-muted text-center py-6">Your basket is empty.</p>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  {basketEntries.map(([id, bi]) => {
                    const max = n(bi.item.quantity_remaining);
                    return (
                      <div key={id} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 text-ink truncate">{bi.item.food_name}</span>
                        {/* Stepper */}
                        <div className="flex items-center border border-border rounded overflow-hidden">
                          <button
                            onClick={() => setQty(id, bi.qty - 1)}
                            className="px-2 py-1 text-muted hover:bg-border font-bold text-xs"
                          >−</button>
                          <span className="px-2 py-1 text-xs font-semibold text-ink border-x border-border min-w-[2rem] text-center">
                            {bi.qty}
                          </span>
                          <button
                            onClick={() => setQty(id, bi.qty + 1)}
                            disabled={bi.qty >= max}
                            className="px-2 py-1 text-muted hover:bg-border font-bold text-xs disabled:opacity-40"
                          >+</button>
                        </div>
                        <button
                          onClick={() => removeItem(id)}
                          className="p-1 text-muted hover:text-error rounded transition-colors"
                          title="Remove"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-3 mb-4 flex justify-between text-sm">
                  <span className="text-muted">Total</span>
                  <span className="font-bold text-ink">{totalCount} units</span>
                </div>
              </>
            )}

            <button
              onClick={handleCheckout}
              disabled={isBasketEmpty || checkingOut}
              className="w-full py-2.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {checkingOut ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Checking out…
                </span>
              ) : 'Checkout'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Section 4: My orders ─────────────────────────────────────────────────────

const DELIVERY_STEPS = ['Claimed', 'Volunteer assigned', 'In transit', 'Delivered'];
const HUB_STEPS      = ['Claimed', 'Dropped at hub', 'Collected'];

function getDeliveryStep(c: Claim): number {
  if (c.pickup_status === 'DELIVERED')                                    return 3;
  if (c.pickup_status === 'IN_TRANSIT')                                   return 2;
  if (c.pickup_status && c.pickup_status !== 'CANCELLED' && c.pickup_status !== 'FAILED') return 1;
  return 0;
}

function getHubStep(c: Claim): number {
  if (c.handover_status === 'COLLECTED') return 2;
  if (c.handover_status === 'DROPPED')   return 1;
  return 0;
}

interface MyOrdersSectionProps {
  triggerReload: number;
}

function MyOrdersSection({ triggerReload }: MyOrdersSectionProps) {
  const [claims,  setClaims]  = useState<Claim[] | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    call<Claim[]>('data', 'myClaims')
      .then(setClaims)
      .catch(err => toast(err instanceof Error ? err.message : 'Could not load orders'))
      .finally(() => setLoading(false));
  }, [triggerReload]);

  // Active hub claims
  const activeHubClaims = (claims ?? []).filter(
    c => c.handover_id != null &&
         (c.handover_status === 'AWAITING_DROP' || c.handover_status === 'DROPPED'),
  );

  return (
    <section id="my-orders" className="scroll-mt-6 mb-14">
      <h2 className="text-lg font-bold text-ink mb-5">My orders</h2>

      {/* Active hub pickup cards */}
      {activeHubClaims.length > 0 && (
        <div className="mb-6">
          <p className="text-sm font-semibold text-ink mb-3">Waiting for you:</p>
          <div className="flex flex-col gap-3">
            {activeHubClaims.map(c => (
              <div key={c.claim_id} className="rounded-xl border-2 border-pink bg-pink-tint p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-sm text-ink">{c.food_name}</p>
                    <p className="text-xs text-muted">Order #{c.claim_id} · {c.hub_name}</p>
                    <p className="text-xs text-muted">
                      Compartment: <strong className="text-ink">{c.compartment_label}</strong>
                    </p>
                  </div>
                  <StatusBadge status={c.handover_status ?? ''} />
                </div>

                {c.pickup_code && (
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span className="text-xs text-muted">Pickup code:</span>
                    <CopyChip code={c.pickup_code} />
                  </div>
                )}

                <Link
                  to="/hub"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-pink hover:underline"
                >
                  <MapPin size={11} />
                  Go to Hub screen
                  <ChevronRight size={11} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !claims?.length ? (
        <EmptyState message="No orders yet. Browse the food feed to order." />
      ) : (
        <div className="flex flex-col gap-4">
          {claims.map(c => {
            const isHub = c.handover_id != null;
            const steps = isHub ? HUB_STEPS : DELIVERY_STEPS;
            const cur   = isHub ? getHubStep(c) : getDeliveryStep(c);

            return (
              <div key={c.claim_id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-ink truncate">{c.food_name}</p>
                    <p className="text-xs text-muted">
                      #{c.claim_id}
                      {' · '}{c.quantity_claimed} {isHub ? `· ${c.hub_name ?? ''}` : ''}
                      {c.volunteer_name ? ` · ${c.volunteer_name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={c.claim_status} />
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isHub ? 'bg-pink-tint text-pink' : 'bg-blue-tint text-blue'
                    }`}>
                      {isHub ? 'Hub pickup' : 'Delivery'}
                    </span>
                  </div>
                </div>
                <Stepper steps={steps} activeIndex={cur} />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Inner page (uses BasketProvider) ─────────────────────────────────────────

function OrderInner() {
  const [profile,       setProfile]       = useState<RecipientProfile | null>(null);
  const [filterHubId,   setFilterHubId]   = useState<number | null>(null);
  const [allHubs,       setAllHubs]       = useState<Hub[]>([]);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    call<RecipientProfile>('data', 'profile')
      .then(setProfile)
      .catch(err => toast(err instanceof Error ? err.message : 'Could not load profile'));
  }, []);

  const reloadOrders = useCallback(() => setOrdersVersion(v => v + 1), []);

  return (
    <DashboardShell role="RECIPIENT" title="Order food" subtitle="Browse available donations">
      <OverviewSection />
      <HubsMapSection
        profile={profile}
        filterHubId={filterHubId}
        setFilterHubId={setFilterHubId}
        allHubs={allHubs}
        setAllHubs={setAllHubs}
      />
      <FindFoodSection
        filterHubId={filterHubId}
        setFilterHubId={setFilterHubId}
        allHubs={allHubs}
        reloadOrders={reloadOrders}
      />
      <MyOrdersSection triggerReload={ordersVersion} />
    </DashboardShell>
  );
}

// ─── Default export ───────────────────────────────────────────────────────────

export default function Order() {
  return (
    <BasketProvider>
      <OrderInner />
    </BasketProvider>
  );
}
