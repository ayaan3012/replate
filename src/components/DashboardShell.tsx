/**
 * DashboardShell — shared two-column shell for /donor, /order, /volunteer.
 *
 * Props:
 *   role      — drives which sidebar items are shown
 *   children  — the page's scrollable content area
 *
 * Sidebar items use anchor href="#<id>" so clicking scrolls to a section
 * the page renders with that id.  A "Hub screen" link to /hub is always shown.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, ChevronLeft, Menu, ExternalLink } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { Role } from "@/lib/api";
import type { ReactNode } from "react";

// ─── Sidebar nav config ───────────────────────────────────────────────────────

const NAV: Record<Role, { id: string; label: string }[]> = {
  DONOR: [
    { id: "overview",          label: "Overview"           },
    { id: "donate-hub",        label: "Donate to a hub"    },
    { id: "donate-delivery",   label: "Donate for delivery"},
    { id: "unfit-food",        label: "Unfit food"         },
    { id: "my-donations",      label: "My donations"       },
  ],
  RECIPIENT: [
    { id: "find-food",         label: "Find food"          },
    { id: "hubs-map",          label: "Hubs map"           },
    { id: "my-orders",         label: "My orders"          },
  ],
  VOLUNTEER: [
    { id: "food-deliveries",   label: "Food deliveries"    },
    { id: "waste-runs",        label: "Waste runs"         },
    { id: "my-history",        label: "My history"         },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  DONOR:     "Donor",
  RECIPIENT: "Recipient",
  VOLUNTEER: "Volunteer",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  role:     Role;
  children: ReactNode;
}

export default function DashboardShell({ role, children }: Props) {
  const { user, logout } = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const [open, setOpen]  = useState(true);   // sidebar open/collapsed

  const handleLogout = async () => {
    try { await logout(); navigate("/"); }
    catch { toast("Logout failed — please try again."); }
  };

  const items = NAV[role];
  const sidebarW = open ? "w-56" : "w-14";

  return (
    <div className="flex h-screen overflow-hidden bg-white">

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <aside
        className={`
          relative flex flex-col shrink-0 border-r border-border
          transition-[width] duration-200 ease-out overflow-hidden
          ${sidebarW}
        `}
      >
        {/* Header — site name */}
        <div className="flex items-center gap-2 h-14 px-3 border-b border-border shrink-0">
          {open && (
            <span
              className="font-bold text-sm text-ink truncate"
              style={{
                background: "linear-gradient(90deg, var(--color-pink), var(--color-blue))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Food Rescue
            </span>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
            className="ml-auto shrink-0 p-1.5 rounded text-muted hover:text-ink hover:bg-border transition-colors"
          >
            {open ? <ChevronLeft size={16} /> : <Menu size={16} />}
          </button>
        </div>

        {/* User identity */}
        {open && user && (
          <div className="px-3 py-3 border-b border-border shrink-0">
            <p className="text-xs font-semibold text-ink truncate">{user.name}</p>
            <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
          </div>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2">
          {items.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`
                flex items-center gap-2 px-3 py-2 text-sm text-muted
                hover:bg-pink-tint hover:text-ink rounded-md mx-1 transition-colors
                ${open ? "" : "justify-center"}
              `}
              title={open ? undefined : item.label}
            >
              {/* Dot bullet when expanded, coloured square when collapsed */}
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-pink opacity-70" />
              {open && <span className="truncate">{item.label}</span>}
            </a>
          ))}

          {/* Divider + Hub screen link */}
          <div className="mx-1 my-2 border-t border-border" />
          <Link
            to="/hub"
            className={`
              flex items-center gap-2 px-3 py-2 text-sm text-blue font-medium
              hover:bg-blue-tint rounded-md mx-1 transition-colors
              ${open ? "" : "justify-center"}
            `}
            title={open ? undefined : "Hub screen"}
          >
            <ExternalLink size={13} className="shrink-0" />
            {open && <span className="truncate">Hub screen</span>}
          </Link>
        </nav>

        {/* Log out */}
        <div className="shrink-0 border-t border-border">
          <button
            onClick={handleLogout}
            className={`
              w-full flex items-center gap-2 px-3 py-3 text-sm text-muted
              hover:bg-border hover:text-ink transition-colors
              ${open ? "" : "justify-center"}
            `}
            title={open ? undefined : "Log out"}
          >
            <LogOut size={14} className="shrink-0" />
            {open && <span>Log out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex items-center h-14 px-6 bg-white border-b border-border">
          <h1 className="text-sm font-semibold text-ink">
            {ROLE_LABEL[role]} dashboard
          </h1>
          {user && (
            <span className="ml-auto text-xs text-muted hidden sm:block">
              {user.name}
            </span>
          )}
        </header>

        {/* Page sections */}
        <main className="px-6 pb-24 pt-6 max-w-5xl mx-auto">
          {children}
        </main>
      </div>

    </div>
  );
}
