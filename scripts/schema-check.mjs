/**
 * Schema checker for surplus_food_rescue database.
 * Run:  node --env-file=.env scripts/schema-check.mjs
 *
 * Prints MISSING for every expected table or column that does not exist,
 * and OK at the end if everything is present.
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const mysql = require("mysql2/promise");

// ─── Expected schema ────────────────────────────────────────────────────────
// Format: { TABLE: [col, col, ...] }

const EXPECTED = {
  DONOR: [
    "donor_id","name","donor_type","phone","email",
    "address","latitude","longitude","trust_score","verified","fssai_no"
  ],
  RECIPIENT: [
    "recipient_id","name","recipient_type","phone","email",
    "address","latitude","longitude","food_need","daily_capacity",
    "trust_score","registration_no","verified",
    "receiving_from","receiving_until","has_cold_storage"
  ],
  VOLUNTEER: [
    "volunteer_id","name","phone","email","vehicle_type",
    "availability_status","trust_score","latitude","longitude",
    "service_radius_km","role"
  ],
  APP_USER: [
    "user_id","email","password_hash","role",
    "donor_id","recipient_id","volunteer_id"
  ],
  COMMUNITY_HUB: [
    "hub_id","name","address","hub_type","steward_name","steward_phone",
    "max_hold_hours","status","latitude","longitude"
  ],
  HUB_COMPARTMENT: [
    "compartment_id","hub_id","label","temp_controlled","max_weight_kg"
  ],
  HUB_HANDOVER: [
    "handover_id","claim_id","compartment_id",
    "drop_code_hash","pickup_code_hash","code_expires_at",
    "failed_attempts","dropped_at","collected_at","stored_until","status"
  ],
  FOOD_CATEGORY: ["category_id","category_name","description"],
  FOOD_LISTING: [
    "listing_id","donor_id","category_id","hub_id","food_name",
    "quantity_total","quantity_unit","weight_per_unit_kg",
    "ready_at","expires_at","storage_type","posted_at","status","is_sealed"
  ],
  FOOD_SAFETY_CHECK: [
    "check_id","listing_id","check_type","temperature_c","result","checked_at","stage"
  ],
  TAG: ["tag_id","tag_name","tag_type"],
  LISTING_TAG: ["listing_id","tag_id","contains_flag"],
  RECIPIENT_TAG_NEED: ["recipient_id","tag_id","need_type"],
  MATCH_SCORE: [
    "match_id","listing_id","recipient_id","score","distance_km","computed_at",
    "distance_score","urgency_score","need_score","fairness_score",
    "offer_status","offered_at","respond_by"
  ],
  CLAIM: [
    "claim_id","listing_id","recipient_id",
    "quantity_claimed","claimed_at","claim_status"
  ],
  DELIVERY_SLOT: [
    "slot_id","slot_date","start_time","end_time","pickup_area","capacity","run_type"
  ],
  PICKUP: [
    "pickup_id","claim_id","volunteer_id","slot_id","pickup_status",
    "picked_up_at","assigned_at","responded_at","delivered_at",
    "quantity_delivered","failure_reason","confirm_code_hash","container_id"
  ],
  CONTAINER: ["container_id","label","container_type"],
  WASTE_PARTNER: [
    "partner_id","name","partner_type","address","phone",
    "licence_no","daily_capacity_kg","min_pickup_kg","active"
  ],
  WASTE_ROUTING: [
    "waste_id","listing_id","route_type","quantity_kg","status",
    "routed_at","partner_id","collection_id","condition_grade"
  ],
  WASTE_COLLECTION: [
    "collection_id","partner_id","slot_id","volunteer_id","container_id",
    "source_type","hub_id","vehicle_no","collected_at","weighed_kg","receipt_ref"
  ],
  IMPACT_RECORD: [
    "impact_id","pickup_id","handover_id","collection_id",
    "meals_saved","kg_diverted","co2_avoided_kg","recorded_at"
  ],
};

// ─── Connect ─────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL is not set. Run with: node --env-file=.env scripts/schema-check.mjs");
  process.exit(1);
}

const conn = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
});

// Detect the schema/database name from the connection
const [[{ DATABASE: dbName }]] = await conn.query("SELECT DATABASE() AS `DATABASE`");

// ─── Fetch all columns from information_schema ───────────────────────────────
const [rows] = await conn.query(
  `SELECT TABLE_NAME, COLUMN_NAME
   FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = ?
   ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  [dbName]
);
await conn.end();

// Build lookup: tableName → Set<columnName> (case-insensitive)
const actual = new Map();
for (const row of rows) {
  const t = row.TABLE_NAME.toUpperCase();
  if (!actual.has(t)) actual.set(t, new Set());
  actual.get(t).add(row.COLUMN_NAME.toLowerCase());
}

// ─── Check ───────────────────────────────────────────────────────────────────
let missingCount = 0;

for (const [table, cols] of Object.entries(EXPECTED)) {
  if (!actual.has(table)) {
    console.log(`MISSING  table  ${table}`);
    missingCount++;
    continue;
  }
  const presentCols = actual.get(table);
  for (const col of cols) {
    if (!presentCols.has(col.toLowerCase())) {
      console.log(`MISSING  ${table}.${col}`);
      missingCount++;
    }
  }
}

if (missingCount === 0) {
  console.log(`OK  all ${Object.keys(EXPECTED).length} tables and their columns are present in ${dbName}`);
} else {
  console.log(`\n${missingCount} missing item(s) found in ${dbName}`);
  process.exit(1);
}
