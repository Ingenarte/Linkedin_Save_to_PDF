#!/usr/bin/env node
/**
 * Ensures release docs match manifest.json version before packaging.
 * Run from the extension project root (directory containing manifest.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest.version;

if (!version) {
  console.error('FAIL: manifest.json has no version field');
  process.exit(1);
}

const checks = [
  {
    file: 'COMPLIANCE.md',
    mustInclude: [`Version ${version} of \`LinkedIn Save to PDF (Ingenarte)\``, `Version ${version} makes no`],
  },
  {
    file: 'PRIVACY.md',
    mustInclude: [`Applies to extension version ${version}`],
  },
  {
    file: 'PRIVACY.html',
    mustInclude: [`Applies to extension version ${version}`],
  },
  {
    file: 'README.md',
    mustInclude: [`**Current version:** ${version}`],
  },
  {
    file: 'CHANGELOG.md',
    mustInclude: [`## [${version}]`],
  },
  {
    file: 'INFO_EXPECTED.md',
    mustInclude: [`**Extension version:** ${version}`],
  },
];

const staleScope = /Version 1\.\d+\.\d+ of `LinkedIn Save to PDF \(Ingenarte\)`/g;
const errors = [];

for (const check of checks) {
  const fullPath = path.join(root, check.file);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing file: ${check.file}`);
    continue;
  }
  const text = fs.readFileSync(fullPath, 'utf8');
  for (const needle of check.mustInclude) {
    if (!text.includes(needle)) {
      errors.push(`${check.file}: missing "${needle}"`);
    }
  }
  if (check.file === 'COMPLIANCE.md') {
    const matches = [...text.matchAll(staleScope)].map((m) => m[0]);
    const wrong = matches.filter((m) => !m.includes(version));
    if (wrong.length) {
      errors.push(`${check.file}: stale scope version(s): ${wrong.join(', ')}`);
    }
  }
}

if (errors.length) {
  console.error(`Release version check FAILED for manifest version ${version}:`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log(`Release version check OK: all release docs match manifest version ${version}`);
