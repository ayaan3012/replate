/**
 * / — REPLATE split-screen login / register page.
 *
 * LEFT: logo, 3-way role tab (SlideTabs), blurb, login/register form.
 * RIGHT (≥900 px): food photo with gradient overlay, REPLATE wordmark, tagline.
 *
 * No social logins, no "Forgot password?", no "Keep me logged in".
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { call, type Role, type AuthResponse } from "@/lib/api";
import { useAuth }    from "@/context/AuthContext";
import { useToast }   from "@/context/ToastContext";
import { SlideTabs }  from "@/components/ui/slide-tabs";
import Logo           from "@/components/Logo";
import ThemeToggle    from "@/components/ThemeToggle";
import AboutDialog    from "@/components/AboutDialog";

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
  { value: "FOOD_ONLY",  label: "Food deliveries"                  },
  { value: "WASTE_ONLY", label: "Waste runs for animals and biogas" },
  { value: "DUAL",       label: "Both"                              },
] as const;

type Mode = "login" | "register";

// ─── Form field primitives ────────────────────────────────────────────────────

const inputBase =
  "w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-border bg-card " +
  "text-ink text-sm placeholder:text-muted " +
  "focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow";

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-semibold text-ink mb-4">
      {text}
      {children}
    </label>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputBase} />;
}

function Sel(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputBase} />;
}

/** Password field with show/hide toggle */
function PasswordInput({ name, placeholder, autoComplete }: {
  name: string; placeholder?: string; autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={6}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${inputBase} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, setUser, loading: authLoading } = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const formRef     = useRef<HTMLFormElement>(null);

  const [role,     setRole]    = useState<Role>("DONOR");
  const [mode,     setMode]    = useState<Mode>("login");
  const [busy,     setBusy]    = useState(false);
  const [inlineErr, setInlineErr] = useState("");
  const [imgErr,   setImgErr]  = useState(false);

  // Already logged in → bounce
  useEffect(() => {
    if (!authLoading && user) navigate(ROLE_HOME[user.role], { replace: true });
  }, [user, authLoading, navigate]);

  const switchRole = (r: Role) => { setRole(r); setMode("login"); setInlineErr(""); };
  const switchMode = (m: Mode) => { setMode(m); setInlineErr(""); };

  // ── Validate ─────────────────────────────────────────────────────────────────
  const validate = (fd: FormData): string => {
    const email = fd.get("email") as string;
    const pw    = fd.get("password") as string;
    if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return "Enter a valid email address.";
    if (!pw || pw.length < 6)  return "Password must be at least 6 characters.";
    if (mode === "register") {
      if (!fd.get("name"))  return "Name is required.";
      if (!fd.get("phone")) return "Phone is required.";
      if ((role === "DONOR" || role === "RECIPIENT") && !fd.get("address"))
        return "Address is required.";
    }
    return "";
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd  = new FormData(e.currentTarget);
    const get = (k: string) => fd.get(k) as string;

    const err = validate(fd);
    if (err) { setInlineErr(err); return; }
    setInlineErr("");
    setBusy(true);

    try {
      if (mode === "login") {
        const res = await call<AuthResponse>("auth", "login", {
          email: get("email"), password: get("password"), role,
        });
        setUser(res.user);
        navigate(ROLE_HOME[res.user.role], { replace: true });
      } else {
        const extra: Record<string, unknown> = {};
        if (role === "DONOR") {
          extra.type    = get("type");
          extra.address = get("address");
        } else if (role === "RECIPIENT") {
          extra.type             = get("type");
          extra.address          = get("address");
          extra.daily_capacity   = Number(get("daily_capacity") || 50);
          extra.has_cold_storage = fd.get("has_cold_storage") === "on";
        } else {
          extra.type  = get("vehicle_type");
          extra.vrole = get("vrole");
        }
        const res = await call<AuthResponse>("auth", "register", {
          name: get("name"), phone: get("phone"),
          email: get("email"), password: get("password"),
          role, ...extra,
        });
        setUser(res.user);
        navigate(ROLE_HOME[res.user.role], { replace: true });
      }
    } catch (caught) {
      const msg = caught instanceof Error ? caught.message : "Something went wrong";
      setInlineErr(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return null;
  if (user)        return null;

  return (
    // full-viewport split, no top-bar padding here — this page is outside Layout
    <div className="min-h-screen flex bg-bg overflow-hidden">

      {/* Theme toggle — fixed top-right */}
      <div className="fixed top-2 right-3 z-40">
        <ThemeToggle />
      </div>

      {/* About us — fixed bottom-left */}
      <div className="fixed bottom-4 left-4 z-30">
        <AboutDialog />
      </div>

      {/* ═══════════════════════════════ LEFT ═══════════════════════════════ */}
      <div className="flex-1 flex flex-col justify-center px-8 py-12 overflow-y-auto min-w-0">
        <div className="mx-auto w-full max-w-sm">

          {/* Logo */}
          <div className="mb-8">
            <Logo />
          </div>

          {/* Role tab */}
          <SlideTabs
            tabs={TABS}
            selected={role}
            onChange={id => switchRole(id as Role)}
          />
          <p className="mt-3 mb-7 text-xs text-muted min-h-[1.2em]">
            {BLURBS[role]}
          </p>

          {/* Form card */}
          <div className="rounded-2xl border border-border bg-card shadow-md p-6">

            <form ref={formRef} onSubmit={handleSubmit} noValidate>

              {/* ── Register-only fields ─────────────────────────────────── */}
              {mode === "register" && (
                <div className="flex flex-col">
                  <FieldLabel text="Name">
                    <Inp name="name" required placeholder="Organisation or full name" />
                  </FieldLabel>

                  <FieldLabel text="Phone">
                    <Inp name="phone" required inputMode="tel" placeholder="10-digit mobile number" />
                  </FieldLabel>

                  {role === "DONOR" && (
                    <>
                      <FieldLabel text="Donor type">
                        <Sel name="type">
                          {DONOR_TYPES.map(t => (
                            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                          ))}
                        </Sel>
                      </FieldLabel>
                      <FieldLabel text="Address">
                        <Inp name="address" required placeholder="Street address, city" />
                      </FieldLabel>
                    </>
                  )}

                  {role === "RECIPIENT" && (
                    <>
                      <FieldLabel text="Organisation type">
                        <Sel name="type">
                          {RECIPIENT_TYPES.map(t => (
                            <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                          ))}
                        </Sel>
                      </FieldLabel>
                      <FieldLabel text="Address">
                        <Inp name="address" required placeholder="Street address, city" />
                      </FieldLabel>
                      <FieldLabel text="Daily capacity (kg)">
                        <Inp name="daily_capacity" type="number" min="1" defaultValue="50" required />
                      </FieldLabel>
                      <label className="flex items-center gap-2.5 mb-4 cursor-pointer text-sm font-medium text-ink">
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
                      <FieldLabel text="Vehicle">
                        <Sel name="vehicle_type">
                          {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                        </Sel>
                      </FieldLabel>
                      <FieldLabel text="Volunteer role">
                        <Sel name="vrole">
                          {VROLES.map(v => (
                            <option key={v.value} value={v.value}>{v.label}</option>
                          ))}
                        </Sel>
                      </FieldLabel>
                    </>
                  )}
                </div>
              )}

              {/* ── Common fields ────────────────────────────────────────── */}
              <FieldLabel text="Email">
                <Inp
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </FieldLabel>

              <FieldLabel text="Password">
                <PasswordInput
                  name="password"
                  placeholder={mode === "register" ? "At least 6 characters" : ""}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </FieldLabel>

              {/* Inline error */}
              {inlineErr && (
                <p className="text-xs text-error mb-3" role="alert">{inlineErr}</p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-[var(--radius-md)] bg-pink text-white font-bold text-sm shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy
                  ? "Please wait…"
                  : mode === "login" ? "Log in" : "Create account"
                }
              </button>

            </form>

            {/* Mode toggle */}
            <p className="mt-4 text-center text-xs text-muted">
              {mode === "login" ? (
                <>Not a member yet?{" "}
                  <button onClick={() => switchMode("register")} className="font-semibold text-pink hover:underline">
                    Register
                  </button>
                </>
              ) : (
                <>Already a member?{" "}
                  <button onClick={() => switchMode("login")} className="font-semibold text-pink hover:underline">
                    Log in
                  </button>
                </>
              )}
            </p>
          </div>

          {/* Browse hubs link */}
          <p className="mt-5 text-center text-xs text-muted">
            Just browsing?{" "}
            <Link to="/hub" className="font-semibold text-blue hover:underline">
              Browse hubs
            </Link>
          </p>

        </div>
      </div>

      {/* ═══════════════════════════════ RIGHT ══════════════════════════════ */}
      {/* Hidden below 900 px — shown via scoped style */}
      <style>{`
        .rp-right {
          display: none;
        }
        @media (min-width: 900px) {
          .rp-right {
            display: flex;
            width: 480px;
            min-width: 420px;
            flex-shrink: 0;
            padding: 24px 24px 24px 0;
            flex-direction: column;
          }
        }
      `}</style>

      <div className="rp-right" aria-hidden="true">
        {/* Photo or gradient fallback */}
        <div
          className="relative flex-1 rounded-3xl overflow-hidden flex flex-col justify-end"
        >
          {/* Background */}
          {!imgErr ? (
            <img
              src="/images/login-food.jpg"
              alt=""
              onError={() => setImgErr(true)}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(135deg, var(--color-pink) 0%, var(--color-blue) 100%)" }}
            />
          )}

          {/* Dark gradient overlay — bottom */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)" }}
          />

          {/* Wordmark + tagline */}
          <div className="relative z-10 p-10 pb-12 select-none">
            <p
              className="text-6xl font-black text-white tracking-tight leading-none mb-3"
              style={{ textShadow: "0 2px 24px rgba(0,0,0,0.5)" }}
            >
              REPLATE
            </p>
            <p className="text-white/75 text-base font-medium leading-snug max-w-xs">
              Good food should reach a plate, not a bin.
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
