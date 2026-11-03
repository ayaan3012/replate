/**
 * AboutDialog — "About us" button + dialog.
 *
 * When `inline` is true, renders just a compact sidebar row (icon + label)
 * that opens the dialog. When false (default), renders the fixed bottom-left
 * button. Both modes share the same dialog content.
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UtensilsCrossed, Lock, Leaf, X, Info } from "lucide-react";

const VISION =
  "We believe good food should reach a plate, not a bin. REPLATE connects donors with surplus food to people and organisations who need it. Community hubs, like smart fridges and lockers, keep food safe and locked until the right person collects it with their code. Food that is no longer fit for people goes to animal shelters, farms and biogas plants, so nothing goes to waste.";

const POINTS = [
  { Icon: UtensilsCrossed, label: "Fresh food to people"   },
  { Icon: Lock,             label: "Safe, code-locked hubs" },
  { Icon: Leaf,             label: "Zero waste"             },
] as const;

export default function AboutDialog({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const closeRef   = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    setTimeout(() => triggerRef.current?.focus(), 50);
  };

  return (
    <>
      {/* Trigger */}
      {inline ? (
        // Sidebar row mode
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-border transition-colors w-full justify-center"
          title="About us"
        >
          <Info size={16} className="shrink-0" />
          <span className="hidden">About us</span>
        </button>
      ) : (
        // Fixed bottom-left button mode
        <button
          ref={triggerRef}
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-muted shadow-md hover:text-ink hover:shadow-lg transition-all"
        >
          About us
        </button>
      )}

      {/* Dialog */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={close}
              className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
              aria-hidden
            />
            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              aria-label="About REPLATE"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="fixed bottom-20 left-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-2xl border border-border bg-card shadow-lg p-6"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-base font-bold text-ink leading-snug">REPLATE</h2>
                <button
                  ref={closeRef}
                  onClick={close}
                  aria-label="Close"
                  className="shrink-0 rounded-full p-1 text-muted hover:bg-border hover:text-ink transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-muted leading-relaxed mb-5">{VISION}</p>
              <ul className="flex flex-col gap-3">
                {POINTS.map(({ Icon, label }) => (
                  <li key={label} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pink-tint">
                      <Icon size={15} className="text-pink" strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-sm font-semibold text-ink">{label}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
