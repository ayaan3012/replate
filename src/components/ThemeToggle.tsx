/**
 * ThemeToggle — sun/moon button that toggles `dark` class on <html>.
 * Persists to localStorage("replate-theme") inside try/catch.
 */
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

function getInitial(): Theme {
  try {
    const saved = localStorage.getItem("replate-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* SSR or privacy mode */ }
  return "light";
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem("replate-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  return (
    <button
      onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={`shrink-0 p-2 rounded-lg text-muted hover:text-ink hover:bg-border transition-colors ${className}`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
