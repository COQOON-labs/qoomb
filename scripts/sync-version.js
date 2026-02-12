#!/usr/bin/env node

/**
 * Sync Version Script
 *
 * Synchronizes APP_VERSION in apps/web/src/App.tsx with .release-please-manifest.json
 * This script is called by Release Please to keep versions in sync.
 *
 * Usage:
 *   node scripts/sync-version.js
 */

const fs = require('fs');
const path = require('path');

// Read version from release-please manifest
const manifestPath = path.join(__dirname, '..', '.release-please-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const version = manifest['.'];

console.log(`📦 Syncing version to: ${version}`);

// Update APP_VERSION in App.tsx
const appPath = path.join(__dirname, '..', 'apps', 'web', 'src', 'App.tsx');
let appContent = fs.readFileSync(appPath, 'utf8');

// Replace APP_VERSION value
const versionRegex = /(export const APP_VERSION = ')([^']+)(')/;
const match = appContent.match(versionRegex);

if (!match) {
  console.error('❌ Could not find APP_VERSION in App.tsx');
  process.exit(1);
}

const oldVersion = match[2];

if (oldVersion === version) {
  console.log(`✅ Version already in sync: ${version}`);
  process.exit(0);
}

appContent = appContent.replace(versionRegex, `$1${version}$3`);
fs.writeFileSync(appPath, appContent, 'utf8');

console.log(`✅ Updated APP_VERSION: ${oldVersion} → ${version}`);
console.log(`   File: apps/web/src/App.tsx`);
