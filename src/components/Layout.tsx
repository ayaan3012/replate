import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import AboutDialog from "@/components/AboutDialog";

interface Props {
  children: ReactNode;
}

/**
 * Shared page shell — used by App.tsx for every route.
 *
 *  ┌─────────────────────────────────────────┐
 *  │ 6 px gradient accent bar (fixed, top)   │
 *  │ Nav (sticky, below bar)                 │
 *  │                                         │
 *  │   <main>  ← page content               │
 *  │                                         │
 *  │ [About us]         (fixed bottom-left)  │
 *  │              [Toast stack] (bottom-right)│
 *  └─────────────────────────────────────────┘
 */
export default function Layout({ children }: Props) {
  return (
    <>
      <Nav />

      {/* pt-6 clears the 6 px top accent bar; pb-24 keeps content above bottom controls */}
      <main className="pt-6 pb-24 max-w-4xl mx-auto px-4">
        {children}
      </main>

      {/* "About us" button — fixed bottom-left on every page */}
      <div className="fixed bottom-4 left-4 z-30">
        <AboutDialog />
      </div>
    </>
  );
}
