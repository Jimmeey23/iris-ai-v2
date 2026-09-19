#!/usr/bin/env node
/**
 * Re-labels historical tickets so their titles describe the issue rather than repeating the
 * taxonomy. Dry run by default; pass --apply to write.
 *
 *   node scripts/relabel-tickets.mjs            # show what would change
 *   node scripts/relabel-tickets.mjs --apply    # write the new labels
 *   node scripts/relabel-tickets.mjs --apply --force   # also re-label hand-written titles
 */
import 'dotenv/config';
import {pool} from '../src/db/index.ts';
import {relabelTickets} from '../src/lib/relabel.ts';

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

try {
  const outcome = await relabelTickets({dryRun: !apply, force});
  console.log(`scanned ${outcome.scanned} · ${apply ? 'relabelled' : 'would relabel'} ${outcome.changed} · left alone ${outcome.skipped}\n`);
  const shown = process.argv.includes('--all') ? outcome.samples : outcome.samples;
  for (const s of shown) {
    console.log(`  ${s.ticketNumber}`);
    console.log(`    before: ${s.from}`);
    console.log(`    after:  ${s.to}`);
  }
  if (!apply && outcome.changed) console.log('\nNothing was written. Re-run with --apply to save these labels.');
} finally {
  await pool.end();
}
