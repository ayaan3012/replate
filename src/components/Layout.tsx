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
      {/* ONE About us button — fixed bottom-left */}
      <div className="fixed bottom-5 left-5 z-30">
        <AboutDialog />
      </div>
    </>
  );
}
