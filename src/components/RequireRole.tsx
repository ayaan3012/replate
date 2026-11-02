import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/api";
import type { ReactNode } from "react";

/** Where to send an already-logged-in user whose role doesn't match. */
const ROLE_HOME: Record<Role, string> = {
  DONOR:     "/donor",
  RECIPIENT: "/order",
  VOLUNTEER: "/volunteer",
};

interface Props {
  role: Role;
  children: ReactNode;
}

/**
 * Wrap a route element with <RequireRole role="DONOR">.
 *
 * - No user    → redirect to "/"   (login/landing page)
 * - Wrong role → redirect to that role's own home page
 * - Correct    → render children
 *
 * While auth is still loading, renders nothing (avoids a flash-redirect).
 */
export default function RequireRole({ role, children }: Props) {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) return <Navigate to="/" replace />;

  if (user.role !== role) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }

  return <>{children}</>;
}
