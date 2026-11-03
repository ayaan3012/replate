/**
 * Logo — rounded square with a Leaf icon + "REPLATE" wordmark.
 * Collapses to just the icon when `collapsed` is true.
 */
import { Leaf } from "lucide-react";

export default function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-blue shadow-sm">
        <Leaf size={16} className="text-white" strokeWidth={2.5} />
      </div>
      {!collapsed && (
        <span
          className="text-sm font-bold tracking-tight text-ink whitespace-nowrap"
          style={{
            background: "linear-gradient(90deg, var(--color-pink), var(--color-blue))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          REPLATE
        </span>
      )}
    </div>
  );
}
