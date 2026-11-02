import { useRef, useLayoutEffect, useState } from "react";
import type { Role } from "@/lib/api";

interface Tab {
  role:  Role;
  label: string;
}

interface Props {
  tabs:     Tab[];
  selected: Role;
  onChange: (role: Role) => void;
}

/**
 * Three-way tab selector with a sliding pink indicator.
 * The indicator measures each button's offsetLeft/offsetWidth at render time
 * and transitions with CSS `transform` + `width` for a smooth slide.
 */
export default function RoleTab({ tabs, selected, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs   = useRef<(HTMLButtonElement | null)[]>([]);

  // indicator position in px — recalculated on selection change
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const idx = tabs.findIndex(t => t.role === selected);
    const btn = buttonRefs.current[idx];
    if (btn) {
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
  }, [selected, tabs]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      className="relative flex bg-border rounded-full p-1 gap-0"
      style={{ isolation: "isolate" }}
    >
      {/* Sliding pill indicator */}
      <span
        aria-hidden
        className="absolute top-1 bottom-1 rounded-full bg-pink shadow-glow-pink transition-all duration-200 ease-out"
        style={{ left: indicator.left, width: indicator.width }}
      />

      {tabs.map((tab, i) => (
        <button
          key={tab.role}
          role="tab"
          aria-selected={tab.role === selected}
          ref={el => { buttonRefs.current[i] = el; }}
          onClick={() => onChange(tab.role)}
          className={[
            "relative z-10 flex-1 py-2 px-4 rounded-full text-sm font-semibold",
            "transition-colors duration-200 focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-pink focus-visible:ring-offset-2",
            tab.role === selected ? "text-white" : "text-muted hover:text-ink",
          ].join(" ")}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
