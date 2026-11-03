/**
 * / — REPLATE split-screen login / register page.
 *
 * LEFT (left-aligned, max-w-[460px]): large REPLATE wordmark at top,
 *   3-way role tab, form card with taller inputs, Browse hubs link.
 * RIGHT (≥900 px): auto-cycling crossfade slideshow of food photos,
 *   gradient overlay, REPLATE wordmark + tagline in white, dot indicators.
 *
 * Auth logic is unchanged — only layout and visuals change.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { call, type Role, type AuthResponse } from "@/lib/api";
import { useAuth }    from "@/context/AuthContext";
import { useToast }   from "@/context/ToastContext";
import { SlideTabs }  from "@/components/ui/slide-tabs";
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

/** Slideshow photos — placed in /public/images/food/ */
const SLIDES = [
  "/images/food/burger.jpg",
  "/images/food/grill-platter.jpg",
  "/images/food/pizza.jpg",
  "/images/food/south-indian-thali.jpg",
];

type Mode = "login" | "register";

// ─── Form field primitives ────────────────────────────────────────────────────

/** Taller inputs (52 px min-height) with 16-17 px text */
const inputBase =
  "w-full px-4 rounded-[var(--radius-md)] border border-border bg-card " +
  "text-ink text-[16px] placeholder:text-muted " +
  "focus:outline-none focus:border-pink focus:shadow-glow-pink transition-shadow " +
  "min-h-[52px]";

function FieldLabel({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[15px] font-semibold text-ink mb-4">
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
        className={`${inputBase} pr-12`}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        tabIndex={-1}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

// ─── Slideshow component ──────────────────────────────────────────────────────

function Slideshow() {
  const [current,  setCurrent]  = useState(0);
  const [failed,   setFailed]   = useState<Set<number>>(new Set());
  const [hovering, setHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const workingSlides = SLIDES.filter((_, i) => !failed.has(i));

  const advance = () => {
    setCurrent(c => {
      const next = (c + 1) % SLIDES.length;
      // skip failed
      return SLIDES.findIndex((_, i) => !failed.has(i) && i > next) !== -1
        ? next
        : SLIDES.findIndex((_, i) => !failed.has(i)) ?? 0;
    });
  };

  useEffect(() => {
    if (hovering || workingSlides.length < 2) return;
    timerRef.current = setInterval(advance, 4000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [hovering, failed]);

  const allFailed = workingSlides.length === 0;

  return (
    <div
      className="relative w-full h-full"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* Fallback gradient underneath */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)" }} />

      {/* Images — crossfade via opacity transition */}
      {!allFailed && SLIDES.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          onError={() => setFailed(f => new Set([...f, i]))}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-1000"
          style={{ opacity: i === current && !failed.has(i) ? 1 : 0 }}
        />
      ))}

      {/* Gradient overlay — strong at bottom for text legibility */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.15) 100%)",
        }}
      />

      {/* Bottom content */}
      <div className="absolute bottom-0 inset-x-0 p-10 pb-10 select-none z-10">
        {/* Wordmark */}
        <p
          className="font-black tracking-tight leading-none mb-3"
          style={{
            fontSize: "clamp(3rem, 5vw, 4.5rem)",
            color: "#ffffff",
            textShadow: "0 2px 28px rgba(0,0,0,0.6)",
          }}
        >
          REPLATE
        </p>
        {/* Tagline — fully white, high contrast */}
        <p
          className="font-medium leading-snug max-w-xs"
          style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.92)" }}
        >
          Good food should reach a plate, not a bin.
        </p>

        {/* Dot indicators */}
        {workingSlides.length > 1 && (
          <div className="flex gap-2 mt-5">
            {SLIDES.map((_, i) => {
              if (failed.has(i)) return null;
              return (
                <button
                  key={i}
                  onClick={() => setCurrent(i)}
                  aria-label={`Slide ${i + 1}`}
                  className="transition-all rounded-full"
                  style={{
                    width:  i === current ? 20 : 8,
                    height: 8,
                    background: i === current
                      ? "rgba(255,255,255,0.95)"
                      : "rgba(255,255,255,0.40)",
                    border: "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { user, setUser, loading: authLoading } = useAuth();
  const { toast }   = useToast();
  const navigate    = useNavigate();
  const formRef     = useRef<HTMLFormElement>(null);

  const [role,      setRole]     = useState<Role>("DONOR");
  const [mode,      setMode]     = useState<Mode>("login");
  const [busy,      setBusy]     = useState(false);
  const [inlineErr, setInlineErr] = useState("");

  useEffect(() => {
    if (!authLoading && user) navigate(ROLE_HOME[user.role], { replace: true });
  }, [user, authLoading, navigate]);

  const switchRole = (r: Role) => { setRole(r); setMode("login"); setInlineErr(""); };
  const switchMode = (m: Mode) => { setMode(m); setInlineErr(""); };

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
    <div className="min-h-screen flex bg-bg overflow-hidden">

      {/* Utilities — fixed */}
      <div className="fixed top-2 right-3 z-40"><ThemeToggle /></div>
      <div className="fixed bottom-4 left-4 z-30"><AboutDialog /></div>

      {/* ═══════════════════ LEFT PANEL ═════════════════════════════════════ */}
      <style>{`
        .rp-left {
          display: flex;
          flex-direction: column;
          flex: 1 1 0;
          min-width: 0;
          overflow-y: auto;
          padding: 48px 40px 64px 48px;
          justify-content: flex-start;
        }
        .rp-form-inner {
          width: 100%;
          max-width: 460px;
        }
        @media (min-width: 900px) {
          .rp-left {
            flex: 0 0 auto;
            width: 52%;
            max-width: 560px;
          }
        }
        @media (max-width: 600px) {
          .rp-left { padding: 32px 20px 48px; }
        }
      `}</style>

      <div className="rp-left">
        <div className="rp-form-inner">
          {/* Decorative logo watermark */}
          <img src="/images/replate-logo.png" alt="" aria-hidden className="logo-watermark" />

          {/* ── Large REPLATE wordmark ── */}
          <div className="mb-10 mt-2">
            <h1
              className="font-brand font-black tracking-tight leading-none"
              style={{
                fontFamily: "var(--font-brand)",
                fontSize: "clamp(3rem, 6vw, 4.5rem)",
                color: "var(--color-primary)",
              }}
            >
              REPLATE
            </h1>
            <p className="text-muted text-sm mt-2">
              Good food should reach a plate, not a bin.
            </p>
          </div>

          {/* ── Role tab ── */}
          <SlideTabs
            tabs={TABS}
            selected={role}
            onChange={id => switchRole(id as Role)}
          />
          <p className="mt-3 mb-7 text-sm text-muted min-h-[1.2em]">
            {BLURBS[role]}
          </p>

          {/* ── Form card ── */}
          <div className="rounded-2xl border border-border bg-card shadow-lg p-7">

            <form ref={formRef} onSubmit={handleSubmit} noValidate>

              {/* Register-only fields */}
              {mode === "register" && (
                <div className="flex flex-col">
                  <FieldLabel text="Name">
                    <Inp name="name" required placeholder="Organisation or full name" />
                  </FieldLabel>
                  <FieldLabel text="Phone">
                    <Inp name="phone" required inputMode="tel" placeholder="10-digit mobile number" />
                  </FieldLabel>

                  {role === "DONOR" && (<>
                    <FieldLabel text="Donor type">
                      <Sel name="type">
                        {DONOR_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                      </Sel>
                    </FieldLabel>
                    <FieldLabel text="Address">
                      <Inp name="address" required placeholder="Street address, city" />
                    </FieldLabel>
                  </>)}

                  {role === "RECIPIENT" && (<>
                    <FieldLabel text="Organisation type">
                      <Sel name="type">
                        {RECIPIENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                      </Sel>
                    </FieldLabel>
                    <FieldLabel text="Address">
                      <Inp name="address" required placeholder="Street address, city" />
                    </FieldLabel>
                    <FieldLabel text="Daily capacity (kg)">
                      <Inp name="daily_capacity" type="number" min="1" defaultValue="50" required />
                    </FieldLabel>
                    <label className="flex items-center gap-2.5 mb-4 cursor-pointer text-[15px] font-medium text-ink">
                      <input type="checkbox" name="has_cold_storage"
                        className="w-4 h-4 rounded" style={{ accentColor: "var(--color-pink)" }} />
                      Has cold storage
                    </label>
                  </>)}

                  {role === "VOLUNTEER" && (<>
                    <FieldLabel text="Vehicle">
                      <Sel name="vehicle_type">
                        {VEHICLE_TYPES.map(v => <option key={v} value={v}>{v}</option>)}
                      </Sel>
                    </FieldLabel>
                    <FieldLabel text="Volunteer role">
                      <Sel name="vrole">
                        {VROLES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                      </Sel>
                    </FieldLabel>
                  </>)}
                </div>
              )}

              {/* Common fields */}
              <FieldLabel text="Email">
                <Inp name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
              </FieldLabel>

              <FieldLabel text="Password">
                <PasswordInput
                  name="password"
                  placeholder={mode === "register" ? "At least 6 characters" : ""}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
              </FieldLabel>

              {inlineErr && (
                <p className="text-sm text-error mb-3 -mt-1" role="alert">{inlineErr}</p>
              )}

              {/* Submit button — taller and bigger text */}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-[var(--radius-md)] bg-pink text-white font-bold shadow-glow-pink hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                style={{ minHeight: 52, fontSize: 17 }}
              >
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
              </button>

            </form>

            {/* Mode toggle */}
            <p className="mt-5 text-center text-sm text-muted">
              {mode === "login" ? (<>
                Not a member yet?{" "}
                <button onClick={() => switchMode("register")}
                  className="font-semibold text-pink hover:underline">Register</button>
              </>) : (<>
                Already a member?{" "}
                <button onClick={() => switchMode("login")}
                  className="font-semibold text-pink hover:underline">Log in</button>
              </>)}
            </p>
          </div>

          {/* Browse hubs */}
          <p className="mt-5 text-center text-sm text-muted">
            Just browsing?{" "}
            <Link to="/hub" className="font-semibold text-blue hover:underline">Browse hubs</Link>
          </p>

        </div>
      </div>

      {/* ═══════════════════ RIGHT PANEL — slideshow ════════════════════════ */}
      <style>{`
        .rp-right {
          display: none;
        }
        @media (min-width: 900px) {
          .rp-right {
            display: flex;
            flex: 1 1 0;
            min-width: 0;
            padding: 20px 20px 20px 0;
          }
        }
      `}</style>

      <div className="rp-right" aria-hidden="true">
        <div className="relative flex-1 rounded-3xl overflow-hidden">
          <Slideshow />
        </div>
      </div>

    </div>
  );
}
