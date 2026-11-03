/**
 * DashboardShell — sidebar + main area for /donor, /order, /volunteer.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, PackageOpen, Truck, AlertTriangle, ClipboardList,
  UtensilsCrossed, MapPin, ShoppingBag,
  Bike, Trash2, History, ExternalLink, LogOut,
  ChevronLeft, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { useAuth }      from "@/context/AuthContext";
import { useToast }     from "@/context/ToastContext";
import type { Role }     from "@/lib/api";
import type { ReactNode } from "react";
import ThemeToggle       from "@/components/ThemeToggle";
import AboutDialog       from "@/components/AboutDialog";

// ─── Nav config ───────────────────────────────────────────────────────────────

interface NavItem { id: string; label: string; icon: LucideIcon }

const NAV: Record<Role, NavItem[]> = {
  DONOR: [
    { id: "overview",        label: "Overview",            icon: LayoutDashboard },
    { id: "donate-hub",      label: "Donate to a hub",     icon: PackageOpen },
    { id: "donate-delivery", label: "Donate for delivery", icon: Truck },
    { id: "unfit-food",      label: "Unfit food",          icon: AlertTriangle },
    { id: "my-donations",    label: "My donations",        icon: ClipboardList },
  ],
  RECIPIENT: [
    { id: "overview",  label: "Overview",  icon: LayoutDashboard },
    { id: "find-food", label: "Find food", icon: UtensilsCrossed },
    { id: "hubs-map",  label: "Hubs map",  icon: MapPin },
    { id: "my-orders", label: "My orders", icon: ShoppingBag },
  ],
  VOLUNTEER: [
    { id: "overview",        label: "Overview",        icon: LayoutDashboard },
    { id: "food-deliveries", label: "Food deliveries", icon: Bike },
    { id: "waste-runs",      label: "Waste runs",      icon: Trash2 },
    { id: "my-history",      label: "History",         icon: History },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  DONOR: "Donor", RECIPIENT: "Recipient", VOLUNTEER: "Volunteer",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  role:      Role;
  children:  ReactNode;
  title?:    string;
  subtitle?: string;
}

export default function DashboardShell({ role, children, title, subtitle }: Props) {
  const { user, logout } = useAuth();
  const { toast }        = useToast();
  const navigate         = useNavigate();
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  const handleLogout = async () => {
    try { await logout(); navigate("/"); }
    catch { toast("Logout failed — please try again."); }
  };

  const items = NAV[role];

  // ── Sidebar logo ─────────────────────────────────────────────────────────────
  // Full-width logo when expanded, smaller square when collapsed.
  const SidebarLogo = (
    <Link
      to="/"
      className="flex items-center justify-center shrink-0 overflow-hidden"
      style={{
        padding: collapsed ? "12px 8px" : "16px 12px",
        minHeight: collapsed ? 64 : 100,
      }}
      title="REPLATE home"
    >
      <img
        src="/images/replate-logo.png"
        alt="REPLATE"
        className="object-contain w-full"
        style={{
          maxWidth: collapsed ? 40 : 160,
          height:   "auto",
          display:  "block",
        }}
        onError={e => {
          // Fallback: hide broken img, show text wordmark
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </Link>
  );

  // ── Sidebar content (shared between desktop aside and mobile drawer) ─────────
  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="shrink-0 border-b border-border">
        {SidebarLogo}
      </div>

      {/* Collapse toggle (desktop only) + mobile close */}
      <div className={[
        "flex items-center shrink-0 border-b border-border px-2 py-1",
        collapsed ? "justify-center" : "justify-end",
      ].join(" ")}>
        <button
          onClick={() => setCollapsed(c => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-border transition-colors hidden lg:block"
        >
          {collapsed ? <Menu size={15} /> : <ChevronLeft size={15} />}
        </button>
        <button
          onClick={() => setMobileOpen(false)}
          className="p-1.5 rounded-lg text-muted hover:text-ink lg:hidden"
        >
          <X size={15} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* WORKSPACE section label */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-3 mb-1">
            Workspace
          </p>
        )}
        <div className="flex flex-col gap-px mb-4">
          {items.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={() => setMobileOpen(false)}
              className={[
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed ? "justify-center" : "",
                "text-muted hover:text-ink hover:bg-border",
              ].join(" ")}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </a>
          ))}
        </div>

        {/* MORE section label */}
        {!collapsed && (
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted px-3 mb-1">
            More
          </p>
        )}
        <div className="flex flex-col gap-px">
          {/* Hub screen */}
          <Link
            to="/hub"
            onClick={() => setMobileOpen(false)}
            className={[
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-border transition-colors",
              collapsed ? "justify-center" : "",
            ].join(" ")}
            title={collapsed ? "Hub screen" : undefined}
          >
            <ExternalLink size={16} className="shrink-0" />
            {!collapsed && <span>Hub screen</span>}
          </Link>

          {/* Log out */}
          <button
            onClick={handleLogout}
            className={[
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-ink hover:bg-border transition-colors w-full",
              collapsed ? "justify-center" : "",
            ].join(" ")}
            title={collapsed ? "Log out" : undefined}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && <span>Log out</span>}
          </button>
        </div>
      </nav>
      {/* No user card here — user info is in the top bar */}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-ink">

      {/* Desktop sidebar */}
      <aside
        className={[
          "relative flex flex-col shrink-0 border-r border-border bg-card",
          "transition-[width] duration-200 ease-out overflow-hidden hidden lg:flex",
          collapsed ? "w-16" : "w-60",
        ].join(" ")}
      >
        {sidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-60 bg-card border-r border-border flex flex-col lg:hidden">
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar — user name + role on the right */}
        <header className="sticky top-0 z-10 flex items-center gap-3 h-14 px-6 bg-bg border-b border-border shrink-0">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg text-muted hover:text-ink hover:bg-border lg:hidden"
          >
            <Menu size={18} />
          </button>

          {/* Page title */}
          <div className="min-w-0">
            {title    && <h1 className="text-sm font-bold text-ink truncate">{title}</h1>}
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>

          <span className="flex-1" />

          {/* User name + role */}
          {user && (
            <div className="hidden sm:flex items-center gap-2 text-right shrink-0">
              <div className="leading-tight">
                <p className="text-xs font-semibold text-ink truncate max-w-[140px]">{user.name}</p>
                <p className="text-xs text-muted">{ROLE_LABEL[role]}</p>
              </div>
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-accent))" }}
              >
                {(user.name ?? "?").split(" ").slice(0,2).map(w => w[0]).join("").toUpperCase()}
              </div>
            </div>
          )}

          <ThemeToggle />
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <main className="relative px-8 pb-28 pt-8 max-w-content mx-auto">
            {/* Decorative watermark */}
            <img
              src="/images/replate-logo.png"
              alt=""
              aria-hidden
              className="logo-watermark"
            />
            {children}
          </main>
        </div>
      </div>

      {/* ONE About us button — fixed bottom-left */}
      <div className="fixed bottom-5 left-5 z-30">
        <AboutDialog />
      </div>
    </div>
  );
}
