// Shared helpers for the verify scripts. Run with cwd = starter and NODE_PATH = starter/node_modules.
const path = require('path');
const STARTER = process.env.STARTER_DIR || path.resolve(process.cwd());
require('dotenv').config({ path: path.join(STARTER, '.env') });
const conn = require(path.join(STARTER, 'server/db/connection'));
// Resolve packages from the starter app's node_modules regardless of where this script lives.
const { createRequire } = require('module');
const starterRequire = createRequire(path.join(STARTER, 'package.json'));

let pass = 0, fail = 0;
const ok = (m) => { console.log('  PASS  ' + m); pass++; };
const bad = (m) => { console.log('  FAIL  ' + m); fail++; };
const info = (m) => console.log('  ....  ' + m);
const done = async () => { try { await conn.close(); } catch (_) {} process.exit(fail ? 1 : 0); };
const projectId = () => process.env.PROJECT_ID || process.env.FIRESTORE_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.DEVSHELL_PROJECT_ID;
const databaseId = () => process.env.FIRESTORE_DATABASE || 'cymbalflix-db';

module.exports = { STARTER, conn, ok, bad, info, done, projectId, databaseId, starterRequire };
