// Rewrites the port-check fingerprints. Run only for an intended gameplay change: node tests/golden/update.mjs
import fs from 'node:fs';
import { loadGame } from '../harness.mjs';
import { snapshot } from './snapshot.mjs';
fs.writeFileSync(new URL('./ports.json', import.meta.url), JSON.stringify(snapshot(loadGame()), null, 1) + '\n');
console.log('wrote tests/golden/ports.json');
