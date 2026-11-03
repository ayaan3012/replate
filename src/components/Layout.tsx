import type { ReactNode } from "react";
import Nav from "@/components/Nav";
import AboutDialog from "@/components/AboutDialog";

interface Props {
  children: ReactNode;
}

/**
 * Shared page shell for public routes (/ and /hub).
 */
export default function Layout({ children }: Props) {
  return (
    <>
      <Nav />
      <main className="pt-6 pb-24 max-w-4xl mx-auto px-4">
        {children}
      </main>
      {/* About us — fixed bottom-left on every page */}
      <div className="fixed bottom-4 left-4 z-30">
        <AboutDialog />
      </div>
    </>
  );
}
