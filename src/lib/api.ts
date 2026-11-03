// ─── Core fetcher ─────────────────────────────────────────────────────────────

/**
 * call("auth", "me")                → GET  /api/auth?a=me
 * call("data", "addListing", body)  → POST /api/data?a=addListing  (JSON body)
 *
 * Throws with the server's { error } message on non-2xx responses.
 *
 * DECIMAL note: MySQL DECIMAL columns arrive as numeric strings ("5.00").
 * Callers must wrap them in Number() before doing arithmetic. Helper: n()
 */
export async function call<T = unknown>(
  file: string,
  action: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`/api/${file}?a=${action}`, {
    method: body !== undefined ? "POST" : "GET",
    credentials: "include",               // send the HttpOnly JWT cookie
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return json as T;
}

/** Safely coerce a MySQL DECIMAL/FLOAT that arrives as a string. */
export const n = (v: unknown): number => Number(v ?? 0);

// ─── Shared primitives ────────────────────────────────────────────────────────

export type Role = "DONOR" | "RECIPIENT" | "VOLUNTEER";
export type VRole = "FOOD_ONLY" | "WASTE_ONLY" | "DUAL";

/** Payload baked into the JWT and returned by auth?a=me */
export interface SessionUser {
  id:   number;
  role: Role;
  pid:  number;   // donor_id | recipient_id | volunteer_id
  name: string;
}

// ─── /api/auth responses ──────────────────────────────────────────────────────

export interface MeResponse     { user: SessionUser | null }
export interface AuthResponse   { user: SessionUser }

// ─── /api/data — profile ─────────────────────────────────────────────────────

export interface DonorProfile {
  name: string; address: string; latitude: string; longitude: string;
  type: string; role: "DONOR";
}
export interface RecipientProfile {
  name: string; address: string; latitude: string; longitude: string;
  type: string; role: "RECIPIENT";
}
export interface VolunteerProfile {
  name: string; latitude: string; longitude: string;
  type: string; vrole: VRole; service_radius_km: string; role: "VOLUNTEER";
}
export type Profile = DonorProfile | RecipientProfile | VolunteerProfile;

// ─── /api/data — lookup tables ───────────────────────────────────────────────

export interface Category { id: number; name: string }
export interface Tag      { id: number; name: string; type: "DIET" | "ALLERGEN" }

// ─── /api/data — donor ───────────────────────────────────────────────────────

export interface Handover {
  handover_id:      number;
  claim_id:         number;
  recipient_name:   string;
  quantity_claimed: number;
  status:           "AWAITING_DROP" | "DROPPED" | "COLLECTED" | "LOCKED";
  compartment_label: string;
  drop_code:        string | null;
}

export interface Listing {
  listing_id:         number;
  food_name:          string;
  status:             string;
  expires_at:         string;
  quantity_unit:      string;
  quantity_remaining: string | number;   // DECIMAL arrives as string
  storage_type:       string;
  hub_name:           string | null;
  handovers:          Handover[];
}

export interface Routing {
  waste_id:     number;
  food_name:    string;
  route_type:   string;
  partner_name: string;
  quantity_kg:  string | number;
  status:       string;
}

export interface DonorImpact {
  meals_saved:    string | number;
  kg_diverted:    string | number;
  co2_avoided_kg: string | number;
  trust_score:    string | number;
}

export interface ReportUnfitResponse {
  partner_name: string;
  route_type:   string;
  kg:           string | number;
}

// ─── /api/data — recipient ───────────────────────────────────────────────────

export interface FeedItem {
  listing_id:         number;
  food_name:          string;
  donor_name:         string;
  tags:               string;
  quantity_remaining: string | number;
  quantity_unit:      string;
  minutes_left:       string | number;
  storage_type:       string;
  hub_id:             number | null;
  hub_name:           string | null;
  score:              string | number | null;
}

export interface ClaimResponse {
  claim_id:    number;
  handover_id: number | null;
  hub_name:    string | null;
  compartment: string | null;
  pickup_code: string | null;
}

export interface Claim {
  claim_id:         number;
  food_name:        string;
  donor_name:       string;
  quantity_claimed: number;
  claim_status:     string;
  pickup_status:    string | null;
  volunteer_name:   string | null;
  handover_id:      number | null;
  handover_status:  string | null;
  hub_name:         string | null;
  compartment_label: string | null;
  pickup_code:      string | null;
}

export interface RecipientImpact {
  claims_completed: number;
  kg_received:      string | number;
  meals_received:   string | number;
}

// ─── /api/data — volunteer / food ────────────────────────────────────────────

export interface Slot {
  slot_id:    number;
  slot_date:  string;
  start_time: string;
  end_time:   string;
}

export interface Job {
  claim_id:         number;
  food_name:        string;
  quantity_claimed: number;
  pickup_from:      string;
  deliver_to:       string;
  expires_at:       string;
  distance_km:      string | number;
  within_radius:    boolean;
  slots:            Slot[];
}

export interface Pickup {
  pickup_id:        number;
  food_name:        string;
  quantity_claimed: number;
  pickup_status:    string;
  pickup_from:      string;
  deliver_to:       string;
  slot_date:        string | null;
  start_time:       string | null;
  end_time:         string | null;
  delivered_at:     string | null;
}

// ─── /api/data — volunteer / waste ───────────────────────────────────────────

export interface WasteJob {
  waste_id:        number;
  food_name:       string;
  donor_address:   string;
  quantity_kg:     string | number;
  condition_grade: string;
  route_type:      string;
  partner_id:      number;
  partner_name:    string;
  partner_address: string;
}

export interface WasteSlot {
  slot_id:    number;
  slot_date:  string;
  start_time: string;
  end_time:   string;
  capacity:   number;
  booked:     number;
}

export interface Container {
  container_id:   number;
  label:          string;
  container_type: string;
}

export interface CollectResponse {
  ok:            number;
  collection_id: number;
  receipt_ref:   string;
}

export interface Collection {
  collection_id: number;
  partner_name:  string;
  weighed_kg:    string | number;
  receipt_ref:   string;
  collected_at:  string;
}

export interface VolunteerImpact {
  deliveries_completed: number;
  kg_delivered:         string | number;
  meals_delivered:      string | number;
  waste_kg_collected:   string | number;
}

// ─── /api/hubs ────────────────────────────────────────────────────────────────

export interface Compartment {
  compartment_id: number;
  label:          string;
  temp_controlled: number;   // 0 | 1
  max_weight_kg:  string | number;
  free_kg:        string | number;
  accepting:      number;    // 0 | 1
}

export interface Hub {
  hub_id:          number;
  name:            string;
  address:         string;
  hub_type:        string;
  latitude:        string | number;
  longitude:       string | number;
  status:          string;
  distance_km?:    string | number;
  available_items: number;
  compartments:    Compartment[];
}

export interface KioskResponse {
  action:      "DROP_OK" | "COLLECT_OK";
  compartment: string;
  message:     string;
}
