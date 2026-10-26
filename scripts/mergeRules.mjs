import { readFileSync, writeFileSync } from 'node:fs';

const header = "rules_version = '2';\n\nservice cloud.firestore {\n  match /databases/{database}/documents {\n";
const footer = '  }\n}\n';
const legacy = readFileSync('firestore.guiro.rules', 'utf8').replaceAll('\r\n', '\n');
const moonlight = readFileSync('firestore.moonlight.rules', 'utf8').replaceAll('\r\n', '\n');

if (!legacy.startsWith(header) || !legacy.endsWith(footer)) {
  throw new Error('Unexpected Guiro rules layout. Review the legacy rules before merging.');
}
if (!moonlight.startsWith(header) || !moonlight.endsWith(footer)) {
  throw new Error('Unexpected MoonLight rules layout. Review the MoonLight rules before merging.');
}

const legacyBody = legacy.slice(header.length, -footer.length);
const moonlightBody = moonlight.slice(header.length, -footer.length);
const nestedBody = moonlightBody
  .split('\n')
  .map((line) => (line ? `  ${line}` : line))
  .join('\n');

const merged = `${header}${legacyBody}    match /events/moonlight-2026-10-28 {\n${nestedBody}    }\n${footer}`;
writeFileSync('firestore.rules', merged);
console.log('Merged Guiro and MoonLight Firestore rules.');
