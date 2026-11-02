PROJECT RULES (apply to every task)
- Project "Surplus Food Rescue": Vercel serverless API in /api (Node, CommonJS, mysql2) on an Aiven MySQL 8 database named surplus_food_rescue.
- Never edit anything in /sql. Never read, print or commit .env. No secrets in code.
- Do not change tables or triggers. If a query fails because of a trigger, return the trigger's message (e.sqlMessage) to the user. Do not work around it.
- All SQL is parameterised (?). All user text shown in the UI is escaped.
- First give a short plan. After finishing, list every file you created or edited. Run `node --check` on JS files you write, and `npm run build` for the frontend.
- Keep docs/API.md up to date with every endpoint (method, action, body, response fields).