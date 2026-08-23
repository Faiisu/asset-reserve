/**
 * Fails when the frontend client stops agreeing with the OpenAPI contract.
 *
 * docs/backend_spec/contracts/ is the single source of truth for request and
 * response shapes, but the browser cannot read YAML, so the client keeps a
 * hand-written copy of the parts it needs. A copy nobody verifies drifts in
 * silence: the role description input capped typing well below the
 * documented limit and quietly truncated pasted text, and several fields
 * enforced nothing at all and only failed on save. Both were invisible to
 * the type checker and to the test suite.
 *
 * This closes that hole without a code generator. The one on npm still
 * declares a peer range of TypeScript 5, and this repo is on 7 -- forcing
 * the install to make a build-time safety check work would trade one risk
 * for a worse one.
 *
 * Run: npm run check:contract   (also part of npm run test:all)
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `yaml` lives in the backend's dependencies -- resolve it from there rather
// than adding a duplicate at the repo root.
const require = createRequire(resolve(root, "backend/package.json"));
const { parse } = require("yaml");

const BUNDLE = resolve(
  root,
  "docs/backend_spec/contracts/dist/openapi.bundle.yaml",
);

if (!existsSync(BUNDLE)) {
  console.error(
    `Bundled contract not found at ${BUNDLE}\n` +
      "Generate it first: cd backend && npm run openapi:bundle",
  );
  process.exit(2);
}

const contract = parse(readFileSync(BUNDLE, "utf8"));
const schemas = contract.components?.schemas ?? {};
const failures = [];

/* ---------------------------------------------------------------- limits */

// Read the limit table out of the frontend source. Parsing the literals is
// deliberate: importing the module would need a TypeScript loader here, and
// the table is a flat list of number literals by design.
const limitsSource = readFileSync(
  resolve(root, "frontend/src/constants/contract-limits.ts"),
  "utf8",
);

const limitEntries = [
  ...limitsSource.matchAll(
    /(\w+):\s*limit\(\s*([\d_]+),\s*"([^"]+)"(?:,\s*"(\w+)")?\s*\)/g,
  ),
].map(([, name, value, ref, keyword]) => ({
  name,
  value: Number(value.replace(/_/g, "")),
  ref,
  keyword: keyword ?? "maxLength",
}));

if (limitEntries.length === 0) {
  failures.push(
    "contract-limits.ts: no limit() entries parsed -- has the file's shape changed?",
  );
}

for (const entry of limitEntries) {
  const [schemaName, property] = entry.ref.split(".");
  const schema = schemas[schemaName];
  if (!schema) {
    failures.push(`${entry.name}: contract has no schema "${schemaName}"`);
    continue;
  }
  const field = schema.properties?.[property];
  if (!field) {
    failures.push(`${entry.name}: "${schemaName}" has no property "${property}"`);
    continue;
  }
  // Arrays carry their string constraints on the item schema.
  const constrained = field[entry.keyword] ?? field.items?.[entry.keyword];
  if (constrained === undefined) {
    failures.push(
      `${entry.name}: contract does not set ${entry.keyword} on ${entry.ref}`,
    );
    continue;
  }
  if (constrained !== entry.value) {
    failures.push(
      `${entry.name}: UI enforces ${entry.keyword} ${entry.value}, ` +
        `contract says ${constrained} (${entry.ref})`,
    );
  }
}

/* ---------------------------------------------------------------- routes */

const contractPaths = new Set(Object.keys(contract.paths ?? {}));

// Paths the client asks for, normalised from template literals to the
// contract's `{param}` placeholders.
const clientSources = ["frontend/src/api.ts", "frontend/src/recognitionApi.ts"]
  .map((file) => readFileSync(resolve(root, file), "utf8"))
  .join("\n");

// Only paths actually handed to request() count -- matching every string
// literal would also pick up the ROOT constant and the examples in comments.
const calledPaths = new Set(
  [...clientSources.matchAll(/\brequest(?:<[^>]*>)?\(\s*[`"]([^`"]+)[`"]/g)]
    .map(([, raw]) => raw)
    .map((raw) =>
      raw
        // recognitionApi builds every path from its ROOT constant.
        .replace(/\$\{ROOT\}/g, "/recognition")
        // Any other interpolation is a path parameter.
        .replace(/\$\{[^}]*\}/g, "{param}"),
    )
    // Query strings come from the same interpolation; drop them.
    .map((raw) => raw.split("?")[0].replace(/\/$/, ""))
    .filter((raw) => raw.startsWith("/")),
);

if (calledPaths.size === 0) {
  failures.push(
    "no request() call sites parsed from the client -- has api.ts changed shape?",
  );
}

const normalisedContract = new Set(
  [...contractPaths].map((path) => path.replace(/\{[^}]+\}/g, "{param}")),
);

for (const path of calledPaths) {
  if (!normalisedContract.has(path)) {
    failures.push(`client calls "${path}", which the contract does not define`);
  }
}

/* ---------------------------------------------------------------- report */

if (failures.length > 0) {
  console.error("Contract drift detected:\n");
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "\nThe contract in docs/backend_spec/contracts/ is the source of truth.\n" +
      "Either correct the client, or change the contract deliberately and\n" +
      "re-run: cd backend && npm run openapi:bundle\n",
  );
  process.exit(1);
}

console.log(
  `Contract check passed: ${limitEntries.length} input limits and ` +
    `${calledPaths.size} client routes agree with the contract.`,
);
