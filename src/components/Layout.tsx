import type { ReactNode } from "react";
import Nav from "@/components/Nav";

interface Props {
  children: ReactNode;
  /** Slot in the bottom-left corner — reserved for an "About us" button. */
  bottomLeft?: ReactNode;
}

/**
 * Shared page shell.
 *
 *  ┌─────────────────────────────────────────┐
 *  │ 6 px gradient accent bar (fixed, top)   │
 *  │ Nav (sticky, below bar)                 │
 *  │                                         │
 *  │   <main>  ← page content               │
 *  │                                         │
 *  │ [bottomLeft slot]          (fixed BL)   │
 *  └─────────────────────────────────────────┘
 */
export default function Layout({ children, bottomLeft }: Props) {
  return (
    <>
      <Nav />

      {/* pt-6 clears the 6 px top accent bar; pb-20 keeps content above bottom slot */}
      <main className="pt-6 pb-20 max-w-4xl mx-auto px-4">
        {children}
      </main>

      {/* Bottom-left slot — empty until an "About us" button is added */}
      {bottomLeft && (
        <div className="fixed bottom-4 left-4 z-30">
          {bottomLeft}
        </div>
      )}
    </>
  );
}
