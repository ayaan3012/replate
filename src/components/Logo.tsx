/**
 * Logo — replate-logo.png + "REPLATE" wordmark in Fraunces.
 * Collapses to just the image when `collapsed` is true.
 */
export default function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 shrink-0">
      {/* Logo image — falls back to coloured square */}
      <img
        src="/images/replate-logo.png"
        alt="REPLATE"
        width={32}
        height={32}
        className="shrink-0 rounded-lg object-contain"
        style={{ imageRendering: "crisp-edges" }}
        onError={e => {
          // fallback: hide broken img, show coloured square
          (e.target as HTMLImageElement).style.display = "none";
          const next = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
          if (next) next.style.display = "flex";
        }}
      />
      {/* Fallback square — hidden by default */}
      <div
        className="shrink-0 h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-black hidden"
        style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))" }}
        aria-hidden
      >
        R
      </div>

      {!collapsed && (
        <span
          className="font-brand font-black tracking-tight text-ink whitespace-nowrap leading-none"
          style={{
            fontSize: "1.2rem",
            color: "var(--color-primary)",
            fontFamily: "var(--font-brand)",
          }}
        >
          REPLATE
        </span>
      )}
    </div>
  );
}
