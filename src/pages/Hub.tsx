/**
 * /hub — public hub vending machine kiosk
 *
 * - Hub dropdown (hubs?a=list)
 * - Compartment grid with progress meters
 * - Keypad: order number + 6-digit code → hubs?a=kiosk
 * - Steward check-in (demo) button → hubs?a=checkin
 */
import { useEffect, useState } from "react";
import {
  Thermometer, Wind, Lock, Unlock, Loader2, CheckCircle,
  XCircle, AlertTriangle, Shield,
} from "lucide-react";
import { call, n, type Hub, type KioskResponse } from "@/lib/api";
import { useToast } from "@/context/ToastContext";

export default function HubPage() {
  const { toast } = useToast();

  const [hubs,         setHubs]         = useState<Hub[]>([]);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [loadingHubs,  setLoadingHubs]  = useState(true);

  // Keypad state
  const [orderNum,  setOrderNum]  = useState("");
  const [code,      setCode]      = useState("");
  const [busy,      setBusy]      = useState(false);
  const [result,    setResult]    = useState<{ type: "success" | "error"; message: string; attempts?: number } | null>(null);

  // Steward check-in
  const [checkinBusy, setCheckinBusy] = useState(false);

  // Load hubs
  useEffect(() => {
    call<Hub[]>("hubs", "list")
      .then(h => { setHubs(h); if (h.length > 0) setSelectedId(h[0].hub_id); })
      .catch(err => toast(err instanceof Error ? err.message : "Could not load hubs"))
      .finally(() => setLoadingHubs(false));
  }, []);

  const selectedHub = hubs.find(h => h.hub_id === selectedId) ?? null;

  // ── Kiosk submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!orderNum || !code) { toast("Enter the order number and code"); return; }
    setBusy(true);
    setResult(null);
    try {
      const res = await call<KioskResponse>("hubs", "kiosk", {
        handover_id: Number(orderNum),
        code: code.trim(),
      });
      setResult({ type: "success", message: res.message });
      setCode("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kiosk error";
      // Try to extract remaining attempts from the message
      const attemptsMatch = msg.match(/(\d+)\s*attempt/i);
      setResult({
        type: "error",
        message: msg,
        attempts: attemptsMatch ? Number(attemptsMatch[1]) : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  // ── Steward check-in ─────────────────────────────────────────────────────────
  const handleCheckin = async () => {
    if (!selectedId) return;
    setCheckinBusy(true);
    try {
      await call("hubs", "checkin", { hub_id: selectedId });
      toast("Check-in recorded", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      setCheckinBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto pt-4">

      {/* Title */}
      <div className="text-center mb-6">
        <h1
          className="text-3xl font-bold tracking-tight mb-1"
          style={{
            background: "linear-gradient(90deg, var(--color-pink), var(--color-blue))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Hub Kiosk
        </h1>
        <p className="text-sm text-muted">
          Donors type their drop code to put food in. Recipients type their pickup code to collect it.
        </p>
      </div>

      {/* Hub dropdown */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-semibold text-ink shrink-0">Hub:</label>
        <select
          value={selectedId ?? ""}
          onChange={e => { setSelectedId(Number(e.target.value)); setResult(null); }}
          disabled={loadingHubs}
          className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-white text-sm text-ink focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow"
        >
          {loadingHubs && <option>Loading…</option>}
          {hubs.map(h => (
            <option key={h.hub_id} value={h.hub_id}>
              {h.name} — {h.address}
            </option>
          ))}
        </select>
        <button
          onClick={handleCheckin}
          disabled={checkinBusy || !selectedId}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg border border-blue text-blue text-xs font-semibold hover:bg-blue-tint disabled:opacity-50 transition-colors"
          title="Steward check-in (demo)"
        >
          {checkinBusy ? <Loader2 size={12} className="animate-spin" /> : <Shield size={12} />}
          Steward check-in
        </button>
      </div>

      {/* Compartment grid */}
      {selectedHub && (
        <div className="mb-8">
          <p className="text-sm font-semibold text-ink mb-3">Compartments at {selectedHub.name}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {selectedHub.compartments.map(c => {
              const freeKg = n(c.free_kg);
              const maxKg  = n(c.max_weight_kg);
              const pct    = maxKg > 0 ? Math.min(100, (freeKg / maxKg) * 100) : 0;
              const cold   = c.temp_controlled === 1;

              return (
                <div
                  key={c.compartment_id}
                  className={`rounded-lg border-2 p-3 ${
                    c.accepting ? "border-success" : "border-border"
                  } bg-white shadow-sm`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-lg text-ink">{c.label}</span>
                    {cold
                      ? <Thermometer size={14} className="text-blue" />
                      : <Wind size={14} className="text-muted" />
                    }
                  </div>
                  <p className="text-xs text-muted mb-1">{cold ? "Cold storage" : "Ambient"}</p>

                  {/* Progress meter */}
                  <div className="w-full bg-border rounded-full h-2 mb-1 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${c.accepting ? "bg-success" : "bg-muted"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted">
                    <strong className="text-ink">{freeKg.toFixed(1)}</strong> / {maxKg.toFixed(1)} kg free
                  </p>

                  {/* Accepting badge */}
                  <span className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                    c.accepting
                      ? "bg-success-tint text-success"
                      : "bg-error-tint text-error"
                  }`}>
                    {c.accepting ? <Unlock size={9} /> : <Lock size={9} />}
                    {c.accepting ? "Accepting" : "Full"}
                  </span>
                </div>
              );
            })}
            {selectedHub.compartments.length === 0 && (
              <p className="text-sm text-muted col-span-full text-center py-4">No compartments configured.</p>
            )}
          </div>

          {selectedHub.available_items > 0 && (
            <p className="text-xs text-muted mt-2 text-center">
              {selectedHub.available_items} item{selectedHub.available_items !== 1 ? "s" : ""} available at this hub
            </p>
          )}
        </div>
      )}

      {/* Keypad panel */}
      <div className="rounded-2xl border-2 border-border bg-white p-6 shadow-md">
        <p className="text-sm font-bold text-ink mb-4 text-center">Enter your code</p>

        <div className="flex flex-col gap-4 max-w-xs mx-auto">
          {/* Order number */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            Order number
            <input
              type="number"
              value={orderNum}
              onChange={e => setOrderNum(e.target.value)}
              placeholder="#"
              className="px-3 py-3 rounded-lg border border-border bg-white text-lg text-center font-bold text-ink focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow"
            />
          </label>

          {/* 6-digit code */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
            6-digit code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className="px-3 py-3 rounded-lg border border-border bg-white text-2xl text-center font-mono font-bold tracking-[0.4em] text-ink focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow"
            />
          </label>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={busy || !orderNum || code.length !== 6}
            className="w-full py-3.5 rounded-lg bg-pink text-white text-sm font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {busy ? <Loader2 size={16} className="inline animate-spin" /> : null}
            {busy ? "Checking…" : "Submit"}
          </button>
        </div>

        {/* Result message */}
        {result && (
          <div className={`mt-5 rounded-lg p-4 text-center ${
            result.type === "success"
              ? "bg-success-tint border-2 border-success"
              : "bg-error-tint border-2 border-error"
          }`}>
            {result.type === "success"
              ? <CheckCircle size={28} className="mx-auto text-success mb-2" />
              : <AlertTriangle size={28} className="mx-auto text-error mb-2" />
            }
            <p className={`text-base font-bold ${
              result.type === "success" ? "text-success" : "text-error"
            }`}>
              {result.message}
            </p>
            {result.type === "error" && result.attempts !== undefined && (
              <p className="text-sm text-error mt-1 font-semibold">
                {result.attempts} attempt{result.attempts !== 1 ? "s" : ""} left
              </p>
            )}
          </div>
        )}
      </div>

      {/* Note */}
      <p className="text-xs text-muted text-center mt-4 max-w-sm mx-auto">
        Donors type their drop code to put food in. Recipients type their pickup code to collect it.
      </p>
    </div>
  );
}