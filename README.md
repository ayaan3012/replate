# Surplus Food Rescue: login + MySQL + Vercel

## Why not your local MySQL?
Vercel runs in the cloud and cannot reach MySQL on your laptop. You need a MySQL 8 server on the internet.
It must support triggers and stored procedures (your script uses them). Some "MySQL-compatible" services do not,
so check before you pick one. Aiven and Railway offer real MySQL, but check their current free plans yourself.

## Steps
1. Create a hosted MySQL 8 database. Note its connection URL: mysql://user:password@host:port/dbname
2. In MySQL Workbench add a new connection to that server. Run, in order:
   a. your surplus_food_rescue_network.sql (if the provider gives you a fixed database name, change the
      DROP/CREATE DATABASE/USE lines to use it)
   b. sql/auth.sql (change the USE line the same way)
3. Push this folder to a GitHub repo.
4. On vercel.com choose Add New > Project, import the repo. Add environment variables:
   - DATABASE_URL = the connection URL from step 1
   - DB_SSL = 1 (if the provider requires SSL)
   - JWT_SECRET = any long random string
5. Deploy. Vercel serves public/index.html and turns api/*.js into serverless functions.

## Run locally first
npm install, then set the same 3 variables in a .env file, then run: npx vercel dev

## How it maps to your SQL
- Register creates a DONOR / RECIPIENT / VOLUNTEER row plus an APP_USER row (hashed password).
- Donor listing -> FOOD_LISTING + a passing FOOD_SAFETY_CHECK (the trigger makes it AVAILABLE) + match scores.
- Recipient order -> CLAIM. The trigger validates stock, expiry, diet and capacity, and errors show on screen.
- Volunteer accept -> PICKUP. Mark delivered -> trigger completes the claim and writes IMPACT_RECORD.
