/**
 * Nav — public navbar (shown on / and /hub).
 * Logged-out: logo, "Hubs" link, theme toggle.
 * Logged-in: same plus the user's dashboard links are NOT shown here
 * (they use the dashboard shell sidebar instead).
 */
import { NavLink } from "react-router-dom";
import Logo        from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

export default function Nav() {
  return (
    <nav className="mt-6 border-b border-border bg-card sticky top-6 z-20">
      <div className="max-w-4xl mx-auto px-4 flex items-center gap-4 h-14">
        {/* Logo */}
        <NavLink to="/" className="shrink-0">
          <Logo />
        </NavLink>

        {/* Links — only public ones */}
        <NavLink
          to="/hub"
          className={({ isActive }) =>
            [
              "text-sm font-semibold whitespace-nowrap border-b-2 -mb-px pb-3.5 transition-colors",
              isActive ? "border-pink text-pink" : "border-transparent text-muted hover:text-ink",
            ].join(" ")
          }
        >
          Hubs
        </NavLink>

        {/* Right side */}
        <span className="flex-1" />
        <ThemeToggle />
      </div>
    </nav>
  );
}
