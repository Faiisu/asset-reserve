import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse, stringify } from "yaml";

const defaultInput = "../docs/backend_spec/contracts/openapi.yaml";
const defaultOutput = "../docs/backend_spec/contracts/dist/openapi.bundle.yaml";

const inputPath = resolve(process.cwd(), process.argv[2] ?? defaultInput);
const outputPath = resolve(process.cwd(), process.argv[3] ?? defaultOutput);
const documentCache = new Map();

function readDocument(filePath) {
  const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
  const cached = documentCache.get(absolutePath);
  if (cached) return cached;

  if (!existsSync(absolutePath)) {
    throw new Error(`OpenAPI reference not found: ${absolutePath}`);
  }

  const document = parse(readFileSync(absolutePath, "utf8"));
  documentCache.set(absolutePath, document);
  return document;
}

function resolveJsonPointer(document, fragment, reference) {
  if (!fragment || fragment === "#") return document;
  if (!fragment.startsWith("#/")) {
    throw new Error(`Unsupported OpenAPI reference fragment: ${reference}`);
  }

  return fragment
    .slice(2)
    .split("/")
    .map((token) =>
      decodeURIComponent(token.replaceAll("~1", "/").replaceAll("~0", "~")),
    )
    .reduce((current, token) => {
      if (
        current === null ||
        typeof current !== "object" ||
        !(token in current)
      ) {
        throw new Error(`OpenAPI reference target not found: ${reference}`);
      }
      return current[token];
    }, document);
}

function bundleNode(value, baseDirectory, referenceStack = []) {
  if (Array.isArray(value)) {
    return value.map((item) => bundleNode(item, baseDirectory, referenceStack));
  }

  if (value === null || typeof value !== "object") return value;

  if (typeof value.$ref === "string" && !value.$ref.startsWith("#")) {
    const [relativeFile, fragment = ""] = value.$ref.split("#", 2);
    const referencedFile = resolve(baseDirectory, relativeFile);
    const referenceKey = `${referencedFile}#${fragment}`;
    if (referenceStack.includes(referenceKey)) {
      throw new Error(`Circular external OpenAPI reference: ${referenceKey}`);
    }

    const referencedDocument = readDocument(referencedFile);
    const referencedValue = resolveJsonPointer(
      referencedDocument,
      fragment ? `#${fragment}` : "",
      value.$ref,
    );
    const bundledValue = bundleNode(
      structuredClone(referencedValue),
      dirname(referencedFile),
      [...referenceStack, referenceKey],
    );
    const siblings = Object.fromEntries(
      Object.entries(value).filter(([key]) => key !== "$ref"),
    );

    return Object.keys(siblings).length === 0
      ? bundledValue
      : {
          ...bundledValue,
          ...bundleNode(siblings, baseDirectory, referenceStack),
        };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      bundleNode(item, baseDirectory, referenceStack),
    ]),
  );
}

const sourceDocument = readDocument(inputPath);
const bundledDocument = bundleNode(sourceDocument, dirname(inputPath));

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  stringify(bundledDocument, { indent: 2, lineWidth: 0 }),
  "utf8",
);

console.log(`Bundled OpenAPI contract: ${inputPath} -> ${outputPath}`);
