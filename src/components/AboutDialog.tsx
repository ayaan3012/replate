/**
 * AboutDialog — "About us" modal.
 *
 * Two trigger modes:
 *   inline=false (default): the fixed bottom-left "About us" button — this is
 *     the ONLY visible About us button site-wide.
 *   inline=true: a compact sidebar icon row (Info icon only, no text label) —
 *     used in DashboardShell's MORE section when sidebar is expanded. The fixed
 *     bottom-left button is ALSO rendered by DashboardShell so there is always
 *     exactly one visible About button per page.
 *
 * Dialog: 700-800px wide, max 85vh, scrollable, bigger text.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UtensilsCrossed, Lock, Leaf, X, Info } from "lucide-react";

const VISION =
  "We believe good food should reach a plate, not a bin. REPLATE connects donors with surplus food to people and organisations who need it. Community hubs, like smart fridges and lockers, keep food safe and locked until the right person collects it with their code. Food that is no longer fit for people goes to animal shelters, farms and biogas plants, so nothing goes to waste.";

const POINTS = [
  { Icon: UtensilsCrossed, label: "Fresh food to people"    },
  { Icon: Lock,             label: "Safe, code-locked hubs"  },
  { Icon: Leaf,             label: "Zero waste"              },
] as const;

export default function AboutDialog({ inline = false }: { inline?: boolean }) {
  const [open, setOpen]  = useState(false);
  const closeRef         = useRef<HTMLButtonElement>(null);
  const triggerRef       = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", h);
    // slight delay so animation runs before focus moves
    setTimeout(() => closeRef.current?.focus(), 60);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  const close = () => {
    setOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 60);
  };

  return (
    <>
      {/* ── Trigger ── */}
      {inline ? (
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          title="About us"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-border transition-colors w-full"
        >
          <Info size={16} className="shrink-0" />
          <span>About us</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rounded-full border border-border bg-card px-5 py-2 text-sm font-semibold text-muted shadow-md hover:text-ink hover:shadow-lg transition-all"
        >
          About us
        </button>
      )}

      {/* ── Dialog ── */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm"
              aria-hidden
            />

            {/* Panel — centered, wide, scrollable */}
            <motion.div
              key="panel"
              role="dialog"
              aria-modal
              aria-label="About REPLATE"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{    opacity: 0, y: 12, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 340, damping: 30 }}
              className="fixed inset-0 z-[51] flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="pointer-events-auto w-full rounded-2xl border border-border bg-card shadow-lg flex flex-col"
                style={{ maxWidth: 760, maxHeight: "85vh" }}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-8 pt-8 pb-4 shrink-0">
                  <h2
                    className="font-brand font-black text-2xl leading-tight"
                    style={{ color: "var(--color-primary)", fontFamily: "var(--font-brand)" }}
                  >
                    REPLATE
                  </h2>
                  <button
                    ref={closeRef}
                    onClick={close}
                    aria-label="Close"
                    className="shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-muted hover:bg-border hover:text-ink transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto px-8 pb-8">
                  <p
                    className="text-muted leading-relaxed mb-8"
                    style={{ fontSize: 17 }}
                  >
                    {VISION}
                  </p>

                  <ul className="flex flex-col gap-4">
                    {POINTS.map(({ Icon, label }) => (
                      <li key={label} className="flex items-center gap-4">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                          style={{ background: "var(--color-pink-tint)" }}
                        >
                          <Icon size={18} style={{ color: "var(--color-primary)" }} strokeWidth={2} aria-hidden />
                        </span>
                        <span className="font-semibold text-ink" style={{ fontSize: 17 }}>
                          {label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
