#!/usr/bin/env node
import 'dotenv/config';
import {pool} from '../src/db/index.ts';
import {backfillHistoricRepairRouting} from '../src/lib/repair-routing-backfill.ts';

const apply=process.argv.includes('--apply');
try{
  const result=await backfillHistoricRepairRouting(!apply);
  console.log(`scanned ${result.scanned} historic tickets · ${apply?'corrected':'would correct'} ${result.changed}`);
  for(const sample of result.samples)console.log(`${sample.ticketNumber}: ${sample.from} -> ${sample.to}`);
  if(!apply&&result.changed)console.log('Nothing was written. Re-run with --apply to save these routing corrections.');
}finally{await pool.end();}
