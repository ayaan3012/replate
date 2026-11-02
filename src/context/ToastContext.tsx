import {
  createContext, useCallback, useContext, useRef, useState,
  type ReactNode,
} from "react";

type ToastKind = "error" | "success" | "info";

interface Toast { id: number; message: string; kind: ToastKind }

interface ToastState {
  /** Show a toast. Returns the toast id. */
  toast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastState | null>(null);

const DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = "error") => {
    const id = ++counter.current;
    setToasts(prev => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DURATION_MS);
  }, []);

  const kindClass: Record<ToastKind, string> = {
    error:   "bg-error   text-white",
    success: "bg-success text-white",
    info:    "bg-blue    text-white",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast stack — bottom-right, above everything except the accent bar */}
      <div
        aria-live="assertive"
        aria-atomic="false"
        className="fixed bottom-6 right-4 z-40 flex flex-col gap-2 items-end pointer-events-none"
      >
        {toasts.map(t => (
          <div
            key={t.id}
            role="alert"
            className={`
              pointer-events-auto max-w-xs rounded-lg px-4 py-3 text-sm font-medium
              shadow-lg animate-[slideUp_0.2s_ease-out]
              ${kindClass[t.kind]}
            `}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
