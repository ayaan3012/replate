import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { call, type Role, type AuthResponse } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { SlideTabs } from "@/components/ui/slide-tabs";

// ─── Static config ────────────────────────────────────────────────────────────

const TABS = [
  { id: "DONOR"     as Role, label: "Donate food" },
  { id: "RECIPIENT" as Role, label: "Take food"   },
  { id: "VOLUNTEER" as Role, label: "Volunteer"   },
];

const BLURBS: Record<Role, string> = {
  DONOR:     "List your surplus food so nearby organisations can claim it before it goes to waste.",
  RECIPIENT: "Browse available donations and order what your shelter, school, or kitchen needs.",
  VOLUNTEER: "Pick up food from donors and deliver to recipients — or run waste collections.",
};

const ROLE_HOME: Record<Role, string> = {
  DONOR:     "/donor",
  RECIPIENT: "/order",
  VOLUNTEER: "/volunteer",
};

const DONOR_TYPES     = ["RESTAURANT","HOTEL","CATERER","EVENT_ORGANISER","SHOP"] as const;
const RECIPIENT_TYPES = ["NGO","SHELTER","ORPHANAGE","COMMUNITY_KITCHEN","OLD_AGE_HOME"] as const;
const VEHICLE_TYPES   = ["WALK","BIKE","SCOOTER","CAR","VAN"] as const;
const VROLES = [
  { value: "FOOD_ONLY", label: "Food deliveries" },
  { value: "WASTE_ONLY", label: "Waste runs for animals and biogas" },
  { value: "DUAL",      label: "Both" },
] as const;

type Mode = "login" | "register";

// ─── Shared primitives ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-sm font-semibold text-ink mb-4">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="mt-1 w-full px-3 py-2.5 rounded border border-border bg-white
                 text-ink text-sm placeholder:text-muted
                 focus:outline-none focus:border-pink focus:shadow-glow-pink
                 transition-shadow"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="mt-1 w-full px-3 py-2.5 rounded border border-border bg-white
                 text-ink text-sm
                 focus:outline-none focus:border-pink focus:shadow-glow-pink
                 transition-shadow"
    />
  );
}

function SubmitBtn({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full mt-2 py-3 rounded-lg bg-pink text-white font-bold text-sm
                 shadow-glow-pink hover:brightness-110 disabled:opacity-50
                 transition-all focus:outline-none focus:shadow-glow-pink"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, setUser, loading: authLoading } = useAuth();
  const { toast }  = useToast();
  const navigate   = useNavigate();

  const [role,    setRole]   = useState<Role>("DONOR");
  const [mode,    setMode]   = useState<Mode>("login");
  const [busy,    setBusy]   = useState(false);

  // Already logged in → bounce to the right dashboard
  useEffect(() => {
    if (!authLoading && user) {
      navigate(ROLE_HOME[user.role], { replace: true });
    }
  }, [user, authLoading, navigate]);

  // ── Form submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => fd.get(k) as string;

    setBusy(true);
    try {
      if (mode === "login") {
        const res = await call<AuthResponse>("auth", "login", {
          email: get("email"), password: get("password"), role,
        });
        setUser(res.user);
        navigate(ROLE_HOME[res.user.role], { replace: true });

      } else {
        // Build role-specific extras
        const extra: Record<string, unknown> = {};
        if (role === "DONOR") {
          extra.type    = get("type");
          extra.address = get("address");
        } else if (role === "RECIPIENT") {
          extra.type           = get("type");
          extra.address        = get("address");
          extra.daily_capacity = Number(get("daily_capacity") || 50);
          extra.has_cold_storage = fd.get("has_cold_storage") === "on";
        } else {
          extra.type    = get("vehicle_type");
          extra.vrole   = get("vrole");
        }

        const res = await call<AuthResponse>("auth", "register", {
          name: get("name"), phone: get("phone"),
          email: get("email"), password: get("password"),
          role, ...extra,
        });
        setUser(res.user);
        navigate(ROLE_HOME[res.user.role], { replace: true });
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Show nothing while we're still checking the existing session
  if (authLoading) return null;
  // If user is set, useEffect will navigate away — render nothing in the meantime
  if (user) return null;

  return (
    <div className="max-w-md mx-auto mt-10 mb-16">

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <h1
          className="text-4xl font-bold tracking-tight mb-2"
          style={{
            background: "linear-gradient(90deg, var(--color-pink), var(--color-blue))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Surplus Food Rescue
        </h1>
        <p className="text-muted text-base">
          Good food should reach a plate, not a bin.
        </p>
      </div>

      {/* ── Role slider ─────────────────────────────────────────────────────── */}
      <SlideTabs
        tabs={TABS}
        selected={role}
        onChange={id => { setRole(id as Role); setMode("login"); }}
        className="mx-auto"
      />

      <p className="mt-3 mb-6 text-sm text-muted text-center min-h-[1.4em]">
        {BLURBS[role]}
      </p>

      {/* ── Auth card ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-white shadow-md p-6">

        {/* Login / Register toggle */}
        <div className="flex gap-0 mb-6 border border-border rounded-lg overflow-hidden text-sm font-semibold">
          {(["login", "register"] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={[
                "flex-1 py-2.5 transition-colors focus:outline-none",
                mode === m
                  ? "bg-pink text-white"
                  : "bg-white text-muted hover:text-ink",
              ].join(" ")}
            >
              {m === "login" ? "Log in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} noValidate>

          {/* ── Register-only fields ────────────────────────────────────────── */}
          {mode === "register" && (
            <>
              <Label>
                Name
                <Input name="name" required placeholder="Organisation or full name" />
              </Label>

              <Label>
                Phone
                <Input name="phone" required placeholder="10-digit mobile number" inputMode="tel" />
              </Label>

              {/* Role-specific fields */}
              {role === "DONOR" && (
                <>
                  <Label>
                    Donor type
                    <Select name="type">
                      {DONOR_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace("_", " ")}</option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Address
                    <Input name="address" required placeholder="Street address, city" />
                  </Label>
                </>
              )}

              {role === "RECIPIENT" && (
                <>
                  <Label>
                    Organisation type
                    <Select name="type">
                      {RECIPIENT_TYPES.map(t => (
                        <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Address
                    <Input name="address" required placeholder="Street address, city" />
                  </Label>
                  <Label>
                    Daily capacity (kg)
                    <Input name="daily_capacity" type="number" min="1" defaultValue="50" required />
                  </Label>
                  <label className="flex items-center gap-3 mb-4 cursor-pointer text-sm font-semibold text-ink">
                    <input
                      type="checkbox"
                      name="has_cold_storage"
                      className="w-4 h-4 accent-[var(--color-pink)] rounded"
                    />
                    Has cold storage
                  </label>
                </>
              )}

              {role === "VOLUNTEER" && (
                <>
                  <Label>
                    Vehicle
                    <Select name="vehicle_type">
                      {VEHICLE_TYPES.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </Select>
                  </Label>
                  <Label>
                    Volunteer role
                    <Select name="vrole">
                      {VROLES.map(v => (
                        <option key={v.value} value={v.value}>{v.label}</option>
                      ))}
                    </Select>
                  </Label>
                </>
              )}
            </>
          )}

          {/* ── Common fields (both modes) ──────────────────────────────────── */}
          <Label>
            Email
            <Input name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
          </Label>

          <Label>
            Password
            <Input
              name="password"
              type="password"
              required
              minLength={6}
              placeholder={mode === "register" ? "Minimum 6 characters" : ""}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </Label>

          <SubmitBtn loading={busy}>
            {mode === "login" ? "Log in" : "Create account"}
          </SubmitBtn>

        </form>
      </div>
    </div>
  );
}
