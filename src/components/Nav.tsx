import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";

const links = [
  { to: "/",          label: "Home",      end: true  },
  { to: "/donor",     label: "Donate",    end: false },
  { to: "/order",     label: "Order",     end: false },
  { to: "/volunteer", label: "Volunteer", end: false },
  { to: "/hub",       label: "Hubs",      end: false },
];

export default function Nav() {
  const { user, logout } = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/");
    } catch {
      toast("Logout failed — please try again.");
    }
  };

  return (
    <nav className="mt-6 border-b border-border bg-white sticky top-6 z-20">
      <div className="max-w-4xl mx-auto px-4 flex items-center gap-1 overflow-x-auto">
        {links.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "py-3 px-4 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors",
                isActive
                  ? "border-pink text-pink"
                  : "border-transparent text-muted hover:text-ink",
              ].join(" ")
            }
          >
            {label}
          </NavLink>
        ))}

        {/* Spacer */}
        <span className="flex-1" />

        {user && (
          <div className="flex items-center gap-3 pl-2 shrink-0">
            <span className="text-sm text-muted hidden sm:block">{user.name}</span>
            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-muted hover:text-ink py-3 px-2 whitespace-nowrap"
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
