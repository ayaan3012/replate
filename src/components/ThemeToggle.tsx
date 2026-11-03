/**
 * ThemeToggle — sun/moon button.
 *
 * The app ships DARK by default (:root in index.css).
 * Switching to light adds class="light" on <html>.
 * Switching back to dark removes it.
 * Preference saved in localStorage("replate-theme") inside try/catch.
 */
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light";

function getInitial(): Theme {
  try {
    const saved = localStorage.getItem("replate-theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* SSR or privacy mode */ }
  return "dark"; // default is dark
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "light") {
    root.classList.add("light");
    root.classList.remove("dark");
  } else {
    root.classList.remove("light");
    root.classList.remove("dark"); // :root IS dark, no class needed
  }
}

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem("replate-theme", theme); } catch { /* ignore */ }
  }, [theme]);

  // Apply on first render too (handles page refresh with saved preference)
  useEffect(() => { applyTheme(getInitial()); }, []);

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
