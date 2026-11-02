import { NavLink } from "react-router-dom";

const links = [
  { to: "/",          label: "Home" },
  { to: "/donor",     label: "Donate" },
  { to: "/order",     label: "Order" },
  { to: "/volunteer", label: "Volunteer" },
  { to: "/hub",       label: "Hubs" },
];

export default function Nav() {
  return (
    <nav className="mt-6 border-b border-brand-line bg-brand-white sticky top-6 z-20">
      <div className="max-w-4xl mx-auto px-4 flex items-center gap-1 overflow-x-auto">
        {links.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              [
                "py-3 px-4 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-brand-pink text-brand-pink"
                  : "border-transparent text-brand-muted hover:text-brand-ink",
              ].join(" ")
            }
          >
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
