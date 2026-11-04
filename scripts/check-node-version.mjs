const [major, minor] = process.versions.node.split(".").map(Number);

if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Node.js >=22.12.0 is required; current version is ${process.version}.`);
  console.error("Switch Node versions before continuing. With nvm, run from the repo root:");
  console.error("  nvm install && nvm use");
  process.exit(1);
}
