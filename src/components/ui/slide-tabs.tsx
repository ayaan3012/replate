/**
 * SlideTabs — animated sliding-pill tab bar.
 * Adapted from the 21st.dev slide-tabs component for this project's theme.
 *
 * Usage:
 *   <SlideTabs
 *     tabs={[{ id: "a", label: "Option A" }, ...]}
 *     selected="a"
 *     onChange={(id) => setSelected(id)}
 *   />
 */
import React, { useRef, useState, useEffect } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SlideTab {
  id:    string;
  label: string;
}

interface SlideTabsProps {
  tabs:     SlideTab[];
  selected: string;
  onChange: (id: string) => void;
  className?: string;
}


export function SlideTabs({ tabs, selected, onChange, className }: SlideTabsProps) {
  const [cursor, setCursor] = useState<TargetAndTransition>({ left: 0, width: 0, opacity: 0 });
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  const measure = (el: HTMLLIElement): TargetAndTransition => ({
    left:    el.offsetLeft,
    width:   el.getBoundingClientRect().width,
    opacity: 1,
  });

  // Recalculate pill position whenever selection changes
  useEffect(() => {
    const idx = tabs.findIndex(t => t.id === selected);
    const el  = refs.current[idx];
    if (el) setCursor(measure(el));
  }, [selected, tabs]);

  const resetToSelected = () => {
    const idx = tabs.findIndex(t => t.id === selected);
    const el  = refs.current[idx];
    if (el) setCursor(measure(el));
  };

  return (
    <ul
      role="tablist"
      onMouseLeave={resetToSelected}
      className={cn(
        "relative flex w-fit rounded-full border-2 border-border bg-white p-1",
        className,
      )}
    >
      {tabs.map((tab, i) => (
        <SlideTabItem
          key={tab.id}
          ref={el => { refs.current[i] = el; }}
          isSelected={tab.id === selected}
          onSelect={() => onChange(tab.id)}
          onHover={el => setCursor(measure(el))}
        >
          {tab.label}
        </SlideTabItem>
      ))}

      {/* Framer-motion animated pill */}
      <motion.li
        aria-hidden
        animate={cursor}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className="pointer-events-none absolute top-1 bottom-1 z-0 rounded-full bg-pink"
      />
    </ul>
  );
}

interface SlideTabItemProps {
  children:   React.ReactNode;
  isSelected: boolean;
  onSelect:   () => void;
  onHover:    (el: HTMLLIElement) => void;
}

const SlideTabItem = React.forwardRef<HTMLLIElement, SlideTabItemProps>(
  ({ children, isSelected, onSelect, onHover }, ref) => (
    <li
      ref={ref}
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      onMouseEnter={e => onHover(e.currentTarget)}
      className={cn(
        "relative z-10 cursor-pointer select-none px-4 py-2 text-sm font-semibold",
        "rounded-full transition-colors duration-150",
        isSelected ? "text-white" : "text-muted hover:text-ink",
      )}
    >
      {children}
    </li>
  ),
);
SlideTabItem.displayName = "SlideTabItem";
