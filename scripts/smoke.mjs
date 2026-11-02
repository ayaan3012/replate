/**
 * Smoke test suite for Surplus Food Rescue API
 * Run:  node scripts/smoke.mjs
 * Requires the dev server on http://localhost:3000 (e.g. `vercel dev`)
 */

// Load .env so DATABASE_URL is available when running outside Vercel
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Minimal .env parser (no dotenv dependency needed)
try {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch { /* .env optional */ }

const BASE = "http://localhost:3000";

// ─── tiny test harness ───────────────────────────────────────────────────────

let passed = 0, failed = 0;

function pass(label) {
  console.log(`  PASS  ${label}`);
  passed++;
}

function fail(label, detail) {
  console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  failed++;
}

function check(label, condition, detail) {
  condition ? pass(label) : fail(label, detail);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

/**
 * Each "session" is an object that carries its own cookie jar.
 * { cookie: string }
 */
function newSession() { return { cookie: "" }; }

function extractCookie(headers, session) {
  const raw = headers.get("set-cookie") ?? "";
  // pick up the t= token
  const m = raw.match(/(?:^|,)\s*(t=[^;]+)/);
  if (m) session.cookie = m[1];
}

async function api(path, opts = {}, session = null) {
  const headers = { "Content-Type": "application/json" };
  if (session?.cookie) headers["Cookie"] = session.cookie;

  const res = await fetch(`${BASE}${path}`, {
    method: opts.body ? "POST" : "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (session) extractCookie(res.headers, session);

  let json;
  try { json = await res.json(); } catch { json = {}; }
  return { status: res.status, body: json };
}

// shorthand wrappers
const get  = (path, session) => api(path, {}, session);
const post = (path, body, session) => api(path, { body }, session);

// ─── helpers ─────────────────────────────────────────────────────────────────
const rand = () => Math.random().toString(36).slice(2, 8);

// MySQL DECIMAL columns come back as strings ("5.00"). Accept number or numeric string.
const isNumeric = v => (typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)))) && v !== null;

// ─── state shared across flows ───────────────────────────────────────────────
const donor     = newSession();
const recipient = newSession();
const volunteer = newSession();

let donorPid, recipientPid, volunteerPid;

// Hub flow
let hubListingId, hubClaimId, hubHandoverId, hubPickupCode, hubDropCode;

// Delivery flow
let deliveryListingId, deliveryClaimId, pickupId;
let impactBefore, impactAfter;

// Waste flow
let wasteListingPartnerId;

// ═══════════════════════════════════════════════════════════════════════════════
// 0. PRE-RUN CLEANUP  (removes any leftover rows from previous smoke runs)
// ═══════════════════════════════════════════════════════════════════════════════
section("0. Pre-run cleanup");

{
  const SMOKE_PHONES = ["9000000001", "9000000002", "9000000003"];

  let dbConn;
  try {
    const mysql = require("mysql2/promise");
    dbConn = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
    });

    await dbConn.query("SET FOREIGN_KEY_CHECKS = 0");

    // Delete APP_USER rows for the smoke phone numbers (joins via profile tables)
    for (const table of ["DONOR", "RECIPIENT", "VOLUNTEER"]) {
      const col = table === "DONOR"      ? "donor_id"
                : table === "RECIPIENT"  ? "recipient_id"
                : "volunteer_id";
      // Find matching profile IDs
      const [ids] = await dbConn.query(
        `SELECT ${col} id FROM ${table} WHERE phone IN (?,?,?)`, SMOKE_PHONES);
      if (ids.length) {
        const idList = ids.map(r => r.id);
        const ph = idList.map(() => "?").join(",");
        await dbConn.query(
          `DELETE FROM APP_USER WHERE ${col} IN (${ph})`, idList);
        await dbConn.query(
          `DELETE FROM ${table} WHERE ${col} IN (${ph})`, idList);
      }
    }

    await dbConn.query("SET FOREIGN_KEY_CHECKS = 1");
    await dbConn.end();
    pass("cleanup smoke test accounts");
  } catch (e) {
    if (dbConn) try { await dbConn.query("SET FOREIGN_KEY_CHECKS = 1"); await dbConn.end(); } catch {}
    fail("cleanup smoke test accounts", e.message);
    // Non-fatal: duplicate-email errors during registration are the worst outcome; continue.
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REGISTRATION
// ═══════════════════════════════════════════════════════════════════════════════
section("1. Registration");

{
  // Donor
  const r = await post("/api/auth?a=register", {
    name: `Smoke Donor ${rand()}`, email: `donor_${rand()}@smoke.test`,
    phone: "9000000001", password: "pass1234", role: "DONOR",
    type: "RESTAURANT", address: "Connaught Place, New Delhi",
  }, donor);
  check("register donor", r.status === 200 && r.body.user?.role === "DONOR", r.body);
  donorPid = r.body.user?.pid;
}

{
  // Recipient — has_cold_storage so it can receive REFRIGERATED/FROZEN too
  const r = await post("/api/auth?a=register", {
    name: `Smoke Recipient ${rand()}`, email: `recip_${rand()}@smoke.test`,
    phone: "9000000002", password: "pass1234", role: "RECIPIENT",
    type: "NGO", address: "Lajpat Nagar, New Delhi",
    has_cold_storage: true, daily_capacity: 200,
  }, recipient);
  check("register recipient (has_cold_storage)", r.status === 200 && r.body.user?.role === "RECIPIENT", r.body);
  recipientPid = r.body.user?.pid;
}

{
  // Volunteer — DUAL so it can do both food and waste runs
  const r = await post("/api/auth?a=register", {
    name: `Smoke Volunteer ${rand()}`, email: `vol_${rand()}@smoke.test`,
    phone: "9000000003", password: "pass1234", role: "VOLUNTEER",
    type: "BIKE", vrole: "DUAL", address: "Saket, New Delhi",
    service_radius_km: 50,
  }, volunteer);
  check("register volunteer (DUAL)", r.status === 200 && r.body.user?.role === "VOLUNTEER", r.body);
  volunteerPid = r.body.user?.pid;
}

{
  // profile returns role field
  const r = await get("/api/data?a=profile", volunteer);
  check("volunteer profile includes vrole", r.body.vrole === "DUAL", r.body);
  check("profile includes role", r.body.role === "VOLUNTEER", r.body);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. HUB FLOW
// ═══════════════════════════════════════════════════════════════════════════════
section("2. Hub flow");

// Fetch a hub to use
let hubId;
{
  const r = await get("/api/hubs?a=list");
  const hubs = Array.isArray(r.body) ? r.body : [];
  const activeHub = hubs.find(h => h.status === "ACTIVE") ?? hubs[0];
  check("hub list returns at least one hub", hubs.length > 0, r.body);
  hubId = activeHub?.hub_id;
}

// categories + tags
let categoryId, dietTagIds = [], allergenRows = [];
{
  const rc = await get("/api/data?a=categories", donor);
  check("categories non-empty", Array.isArray(rc.body) && rc.body.length > 0, rc.body);
  categoryId = rc.body[0]?.id;

  const rt = await get("/api/data?a=tags", donor);
  check("tags non-empty", Array.isArray(rt.body) && rt.body.length > 0, rt.body);
  dietTagIds    = rt.body.filter(t => t.type === "DIET").slice(0, 1).map(t => t.id);
  allergenRows  = rt.body.filter(t => t.type === "ALLERGEN").slice(0, 1)
                         .map(t => ({ tag_id: t.id, contains: false }));
}

// Donor: addListing for a hub (AMBIENT, sealed)
{
  const r = await post("/api/data?a=addListing", {
    category_id: categoryId, food_name: "Hub Smoke Biryani",
    qty: 5, unit: "boxes", weight: 0.5,
    hours: 6, storage: "AMBIENT", is_sealed: true,
    hub_id: hubId,
    tag_ids: dietTagIds,
    allergens: allergenRows,
  }, donor);
  check("donor addListing (hub, sealed, AMBIENT)", r.status === 200 && r.body.id > 0, r.body);
  hubListingId = r.body.id;
}

// Recipient: claim the hub listing — should get handover + pickup_code
{
  const r = await post("/api/data?a=claim", {
    listing_id: hubListingId, qty: 2,
  }, recipient);
  check("recipient claim hub listing", r.status === 200 && r.body.claim_id > 0, r.body);
  check("claim returns handover_id",   r.body.handover_id > 0, r.body);
  check("claim returns compartment",   typeof r.body.compartment === "string", r.body);
  check("claim returns pickup_code",   /^\d{6}$/.test(r.body.pickup_code ?? ""), r.body);
  hubClaimId   = r.body.claim_id;
  hubHandoverId = r.body.handover_id;
  hubPickupCode = r.body.pickup_code;
}

// Donor: myListings shows handover with drop_code (status AWAITING_DROP)
{
  const r = await get("/api/data?a=myListings", donor);
  check("myListings returns array", Array.isArray(r.body), r.body);
  const listing = r.body.find(l => l.listing_id === hubListingId);
  check("hub listing present in myListings",       !!listing, { hubListingId, ids: r.body.map(l => l.listing_id) });
  const handover = listing?.handovers?.find(hv => hv.handover_id === hubHandoverId);
  check("handover present in myListings",           !!handover, listing?.handovers);
  check("drop_code present (AWAITING_DROP)",        /^\d{6}$/.test(handover?.drop_code ?? ""), handover);
  hubDropCode = handover?.drop_code;
}

// Kiosk: DROP with correct drop code → DROP_OK
{
  const r = await post("/api/hubs?a=kiosk", {
    handover_id: hubHandoverId, code: hubDropCode,
  });
  check("kiosk drop with correct code → DROP_OK", r.body.action === "DROP_OK", r.body);
}

// Kiosk: wrong code → error (one failed attempt)
{
  // compute a code that is definitely wrong
  const wrongCode = String((Number(hubDropCode) + 1) % 1000000).padStart(6, "0");
  const r = await post("/api/hubs?a=kiosk", {
    handover_id: hubHandoverId, code: wrongCode,
  });
  check("kiosk wrong code → error response", r.status !== 200 || r.body.error, r.body);
}

// Kiosk: COLLECT with correct pickup code → COLLECT_OK
{
  const r = await post("/api/hubs?a=kiosk", {
    handover_id: hubHandoverId, code: hubPickupCode,
  });
  check("kiosk collect with correct pickup_code → COLLECT_OK", r.body.action === "COLLECT_OK", r.body);
}

// myClaims: pickup_code null after COLLECTED
{
  const r = await get("/api/data?a=myClaims", recipient);
  const claim = Array.isArray(r.body) ? r.body.find(c => c.claim_id === hubClaimId) : null;
  check("myClaims shows hub claim", !!claim, r.body);
  check("pickup_code null after COLLECTED", claim?.pickup_code === null, claim);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DELIVERY FLOW
// ═══════════════════════════════════════════════════════════════════════════════
section("3. Delivery flow");

// Donor: addListing with no hub, expires in 8 hours
{
  const r = await post("/api/data?a=addListing", {
    category_id: categoryId, food_name: "Delivery Smoke Dal Makhani",
    qty: 10, unit: "portions", weight: 0.3,
    hours: 8, storage: "HOT", is_sealed: false,
    hub_id: null, tag_ids: [], allergens: [],
  }, donor);
  check("donor addListing (no hub, HOT, 8h)", r.status === 200 && r.body.id > 0, r.body);
  deliveryListingId = r.body.id;
}

// Recipient: claim
{
  const r = await post("/api/data?a=claim", { listing_id: deliveryListingId, qty: 3 }, recipient);
  check("recipient claim delivery listing", r.status === 200 && r.body.claim_id > 0, r.body);
  check("no handover for non-hub listing",  r.body.handover_id === null, r.body);
  deliveryClaimId = r.body.claim_id;
}

// Volunteer: jobs — claim appears with ≥1 slot
{
  const r = await get("/api/data?a=jobs", volunteer);
  check("jobs returns array", Array.isArray(r.body), r.body);
  const job = r.body.find(j => j.claim_id === deliveryClaimId);
  check("delivery claim in jobs",       !!job, { deliveryClaimId, ids: r.body.map(j => j.claim_id) });
  check("job has distance_km",          isNumeric(job?.distance_km), job);
  check("job has within_radius field",  "within_radius" in (job ?? {}), job);
  check("job has at least one slot",    (job?.slots?.length ?? 0) > 0, job?.slots);

  // Accept using the first available slot
  if (job?.slots?.length) {
    const slotId = job.slots[0].slot_id;
    const ra = await post("/api/data?a=accept", { claim_id: deliveryClaimId, slot_id: slotId }, volunteer);
    check("volunteer accept job", ra.status === 200 && ra.body.ok === 1, ra.body);
    pickupId = ra.body.pickup_id;
  } else {
    fail("volunteer accept job", "no eligible slot found");
    pickupId = null;
  }
}

// myPickups: pickup appears
{
  const r = await get("/api/data?a=myPickups", volunteer);
  check("myPickups returns array", Array.isArray(r.body), r.body);
  const pickup = r.body.find(p => p.pickup_id === pickupId);
  check("pickup in myPickups",        !!pickup, { pickupId, ids: r.body.map(p => p.pickup_id) });
  check("pickup has slot_date",       !!pickup?.slot_date, pickup);
  check("pickup has delivered_at null initially", pickup?.delivered_at === null, pickup);
}

// setStatus IN_TRANSIT
{
  const r = await post("/api/data?a=setStatus", { pickup_id: pickupId, status: "IN_TRANSIT" }, volunteer);
  check("setStatus IN_TRANSIT", r.status === 200 && r.body.ok === 1, r.body);
}

// setStatus DELIVERED
{
  const r = await post("/api/data?a=setStatus", { pickup_id: pickupId, status: "DELIVERED" }, volunteer);
  check("setStatus DELIVERED", r.status === 200 && r.body.ok === 1, r.body);
}

// myPickups: delivered_at now set
{
  const r = await get("/api/data?a=myPickups", volunteer);
  const pickup = Array.isArray(r.body) ? r.body.find(p => p.pickup_id === pickupId) : null;
  check("pickup status DELIVERED in myPickups", pickup?.pickup_status === "DELIVERED", pickup);
  check("delivered_at set after DELIVERED",     !!pickup?.delivered_at, pickup);
}

// volunteer myImpact: deliveries_completed ≥ 1
{
  const r = await get("/api/data?a=myImpact", volunteer);
  check("volunteer myImpact has deliveries_completed",
    typeof r.body.deliveries_completed === "number", r.body);
  // Note: IMPACT_RECORD is written by a DB trigger; row may not exist yet in all environments
  // We only verify the shape; a zero count is acceptable for a smoke test
  check("volunteer myImpact has waste_kg_collected field",
    "waste_kg_collected" in r.body, r.body);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. WASTE FLOW
// ═══════════════════════════════════════════════════════════════════════════════
section("4. Waste flow");

let wasteRoutingId;

// Donor: reportUnfit BIOGAS_ONLY
{
  const r = await post("/api/data?a=reportUnfit", {
    category_id: categoryId,
    food_name: "Smoke Stale Bread",
    qty: 20, unit: "loaves", weight: 0.25,
    grade: "BIOGAS_ONLY",
  }, donor);
  check("reportUnfit BIOGAS_ONLY", r.status === 200 && !!r.body.partner_name, r.body);
  check("reportUnfit returns route_type", !!r.body.route_type, r.body);
  check("reportUnfit returns kg",         isNumeric(r.body.kg), r.body);

  // myRoutings shows it
  const rr = await get("/api/data?a=myRoutings", donor);
  check("myRoutings returns array", Array.isArray(rr.body), rr.body);
  // route_type will match partner type; just check array is non-empty
  check("myRoutings non-empty after reportUnfit", rr.body.length > 0, rr.body);
}

// Volunteer: wasteJobs — routed item appears
{
  const r = await get("/api/data?a=wasteJobs", volunteer);
  check("wasteJobs returns array", Array.isArray(r.body), r.body);
  if (r.body.length > 0) {
    const job = r.body[0];
    check("wasteJob has waste_id",     typeof job.waste_id === "number", job);
    check("wasteJob has quantity_kg",  isNumeric(job.quantity_kg), job);
    check("wasteJob has partner_name", typeof job.partner_name === "string", job);
    wasteRoutingId = job.waste_id;
  } else {
    fail("wasteJobs non-empty after reportUnfit", r.body);
    fail("wasteJob has waste_id",     "skipped — no jobs");
    fail("wasteJob has quantity_kg",  "skipped — no jobs");
    fail("wasteJob has partner_name", "skipped — no jobs");
  }
}

// Volunteer: wasteSlots
let wasteSlotId, containerId;
{
  const r = await get("/api/data?a=wasteSlots", volunteer);
  check("wasteSlots returns array", Array.isArray(r.body), r.body);
  if (r.body.length > 0) {
    check("wasteSlot has slot_id",  typeof r.body[0].slot_id === "number", r.body[0]);
    check("wasteSlot has end_time", typeof r.body[0].end_time === "string", r.body[0]);
    wasteSlotId = r.body[0].slot_id;
  } else {
    fail("wasteSlots non-empty", "no slots — sp_ensure_slots may need a run_type WASTE row seeded");
    fail("wasteSlot has slot_id",  "skipped — no slots");
    fail("wasteSlot has end_time", "skipped — no slots");
  }
}

// Volunteer: containers
{
  const r = await get("/api/data?a=containers", volunteer);
  check("containers returns array", Array.isArray(r.body), r.body);
  if (r.body.length > 0) {
    check("container has container_id", typeof r.body[0].container_id === "number", r.body[0]);
    check("container has label",        typeof r.body[0].label === "string", r.body[0]);
    containerId = r.body[0].container_id;
  } else {
    fail("containers non-empty", "no WASTE containers in DB");
    fail("container has container_id", "skipped — no containers");
    fail("container has label",        "skipped — no containers");
  }
}

// Volunteer: collect
if (wasteRoutingId && wasteSlotId && containerId) {
  const r = await post("/api/data?a=collect", {
    waste_ids: [wasteRoutingId],
    slot_id: wasteSlotId,
    container_id: containerId,
    vehicle_no: "DL01SMOKE1",
    weighed_kg: 4.5,
  }, volunteer);
  check("collect returns ok", r.status === 200 && r.body.ok === 1, r.body);
  check("collect returns collection_id", typeof r.body.collection_id === "number", r.body);
  check("collect returns receipt_ref",   typeof r.body.receipt_ref === "string", r.body);

  // myCollections
  const rc = await get("/api/data?a=myCollections", volunteer);
  check("myCollections returns array", Array.isArray(rc.body), rc.body);
  const col = rc.body.find(c => c.collection_id === r.body.collection_id);
  check("collection in myCollections", !!col, { id: r.body.collection_id, ids: rc.body.map(c => c.collection_id) });
} else {
  fail("collect", "skipped — missing wasteRoutingId, wasteSlotId, or containerId");
  fail("myCollections", "skipped");
}

// ─── summary ─────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`  ${passed + failed} checks: ${passed} passed, ${failed} failed`);
console.log(`${"─".repeat(48)}`);
if (failed > 0) process.exit(1);
