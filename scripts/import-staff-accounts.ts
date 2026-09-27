/**
 * Provisions workspace login accounts for the active staff directory.
 *
 * For each person: creates a Supabase Auth user with the shared provisioning
 * password, inserts the matching `app_users` profile linked to their existing
 * `staff` row, records the studios they cover, and flags the account so the app
 * blocks everything until they set their own password.
 *
 * Also back-fills `staff.phone`, which the n8n webhook payload reports as the
 * ticket owner's contact number.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx tsx --tsconfig tsconfig.checks.json scripts/import-staff-accounts.ts
 *   npx tsx --tsconfig tsconfig.checks.json scripts/import-staff-accounts.ts --apply
 *
 * Re-runnable: an email that already has a profile is reported and skipped, so a
 * partial run can be finished by running it again.
 */
import {eq} from 'drizzle-orm';
import {db} from '../src/db';
import {appUsers, staff} from '../src/db/schema';
import {createSupabaseAdminClient} from '../src/lib/supabase/admin';

const APPLY = process.argv.includes('--apply');

/** The password every provisioned account starts with. Twelve characters is the
 *  workspace minimum (api/auth/route.ts), which '$upport@57' alone does not meet. */
const PROVISIONING_PASSWORD = '$upport@57india';

const MUMBAI = ['Kwality House, Kemps Corner', 'Supreme HQ, Bandra', 'Courtside, Mumbai'];
const BENGALURU = ['Kenkere House, Bengaluru', 'the Studio by Copper & Cloves, Bengaluru'];
const KWALITY = ['Kwality House, Kemps Corner'];
const SUPREME = ['Supreme HQ, Bandra'];

type Person = {
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'agent';
  department: string | null;
  manager: string | null;
  phone: string | null;
  /** Studios this person covers. Empty means no studio-wide visibility. */
  studios: string[];
};

/** Active employees from the Zoho export, with the studio cover supplied by the
 *  workspace owner. Management and back-office roles carry no studio: admins see
 *  everything regardless, and the rest are not floor staff. */
const PEOPLE: Person[] = [
  // ── Admins ────────────────────────────────────────────────────────────────
  {email: 'jimmeey@physique57india.com', name: 'Jimmeey Gondaa', role: 'admin', department: 'Sales & Client Servicing', manager: 'Mitali Kumar', phone: '9152331990', studios: []},
  {email: 'mitali@physique57india.com', name: 'Mitali Kumar', role: 'admin', department: 'Management', manager: null, phone: '9819693270', studios: []},
  {email: 'saachi@physique57india.com', name: 'Saachi Shetty', role: 'admin', department: 'Operations', manager: 'Mitali Kumar', phone: null, studios: []},
  {email: 'sachin@physique57mumbai.com', name: 'Sachin Nalawade', role: 'admin', department: 'Accounts', manager: 'Mitali Kumar', phone: null, studios: []},
  // ── Managers (Head / Lead / Manager designations) ─────────────────────────
  {email: 'shifa@physique57bengaluru.com', name: 'Shifa Ali', role: 'manager', department: 'Management', manager: 'Mitali Kumar', phone: '9886029223', studios: BENGALURU},
  {email: 'saachi.s@physique57bengaluru.com', name: 'Saachi Shetty Jr', role: 'manager', department: 'Marketing', manager: 'Shifa Ali', phone: null, studios: BENGALURU},
  // ── Kwality House, Kemps Corner ───────────────────────────────────────────
  {email: 'akshay@physique57mumbai.com', name: 'Akshay Rane', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: '9137261245', studios: KWALITY},
  {email: 'vahishta@physique57mumbai.com', name: 'Vahishta Fitter', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: null, studios: KWALITY},
  {email: 'tahira@physique57mumbai.com', name: 'Taahira Sayyed', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: '8291886949', studios: KWALITY},
  {email: 'sheetal@physique57mumbai.com', name: 'Sheetal Kataria', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: '9820858860', studios: KWALITY},
  // ── Supreme HQ, Bandra ────────────────────────────────────────────────────
  {email: 'imran@physique57mumbai.com', name: 'Imran Shaikh', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: '7021858667', studios: SUPREME},
  {email: 'shipra@physique57mumbai.com', name: 'Shipra Pinge', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: '9967631061', studios: SUPREME},
  {email: 'deesha@physique57mumbai.com', name: 'Deesha Changwani', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: null, studios: SUPREME},
  {email: 'nadiya@physique57mumbai.com', name: 'Nadiya Shaikh', role: 'agent', department: 'Sales & Client Servicing', manager: 'Jimmeey Gondaa', phone: null, studios: SUPREME},
  // ── Bengaluru studios ─────────────────────────────────────────────────────
  {email: 'api@physique57bengaluru.com', name: 'Api Serou', role: 'agent', department: 'Sales & Client Servicing', manager: 'Shifa Ali', phone: '7629014250', studios: BENGALURU},
  {email: 'prathap@physique57bengaluru.com', name: 'Prathap K P', role: 'agent', department: 'Sales & Client Servicing', manager: 'Shifa Ali', phone: '6360660189', studios: BENGALURU},
  {email: 'yashas@physique57bengaluru.com', name: 'Yashas K', role: 'agent', department: 'Sales & Client Servicing', manager: 'Shifa Ali', phone: null, studios: BENGALURU},
  {email: 'sashi@physique57bengaluru.com', name: 'Sashi Singh', role: 'agent', department: 'Sales & Client Servicing', manager: 'Shifa Ali', phone: null, studios: BENGALURU},
  // ── Trainers: all studios in their city ───────────────────────────────────
  {email: 'mrigakshi@physique57mumbai.com', name: 'Mrigakshi Jaiswal', role: 'agent', department: 'Training', manager: 'Anisha Shah', phone: '9820934265', studios: MUMBAI},
  {email: 'vivaran@physique57mumbai.com', name: 'Vivaran Dhasmana', role: 'agent', department: 'Training', manager: 'Anisha Shah', phone: '8104674575', studios: MUMBAI},
  {email: 'pushyank@physique57bengaluru.com', name: 'Pushyank Nahar', role: 'agent', department: 'Training', manager: 'Anisha Shah', phone: '9741307676', studios: BENGALURU},
  {email: 'anisha@physique57india.com', name: 'Anisha Shah', role: 'agent', department: 'Training', manager: 'Mitali Kumar', phone: '9930688182', studios: MUMBAI},
  // ── Operations, accounts, marketing: no studio cover ──────────────────────
  {email: 'zahur@physique57mumbai.com', name: 'Zahur Shaikh', role: 'agent', department: 'Operations', manager: 'Saachi Shetty', phone: '9833995082', studios: MUMBAI},
  {email: 'accounts@physique57mumbai.com', name: 'Sagar Ingole', role: 'agent', department: 'Operations', manager: 'Zahur Shaikh', phone: '8291336080', studios: MUMBAI},
  {email: 'gaurav@physique57mumbai.com', name: 'Gaurav Sogam', role: 'agent', department: 'Accounts', manager: 'Sachin Nalawade', phone: '9029366350', studios: []},
  {email: 'pujal@physique57mumbai.com', name: 'Pujal Jathar', role: 'agent', department: 'Accounts', manager: 'Sachin Nalawade', phone: null, studios: []},
  {email: 'rasika@physique57mumbai.com', name: 'Rasika Kalambe', role: 'agent', department: 'Accounts', manager: 'Sachin Nalawade', phone: null, studios: []},
  {email: 'shaina@physique57mumbai.com', name: 'Shaina Saraiya', role: 'agent', department: 'Marketing', manager: 'Mitali Kumar', phone: '7506936422', studios: []},
];

const log = (...a: unknown[]) => console.log(...a);

async function main() {
  log(`\n${APPLY ? 'APPLYING' : 'DRY RUN'} — ${PEOPLE.length} people\n`);

  const existingUsers = await db.select({email: appUsers.email}).from(appUsers);
  const haveProfile = new Set(existingUsers.map(u => u.email.toLowerCase()));
  const staffRows = await db.select({id: staff.id, email: staff.email, phone: staff.phone}).from(staff);
  const staffByEmail = new Map(staffRows.map(r => [r.email.toLowerCase(), r]));

  const service = APPLY ? createSupabaseAdminClient() : null;
  let created = 0, skipped = 0, failed = 0, phones = 0;

  for (const p of PEOPLE) {
    const email = p.email.toLowerCase();
    const staffRow = staffByEmail.get(email);
    const cover = p.studios.length ? p.studios.length + ' studio(s)' : 'no studio';
    const label = `${p.name.padEnd(20)} ${p.role.padEnd(7)} ${cover}`;

    if (!staffRow) { log(`  SKIP  ${label}  — no staff record for ${email}`); skipped++; continue; }
    if (haveProfile.has(email)) { log(`  SKIP  ${label}  — already has a profile`); skipped++; continue; }

    if (!APPLY) { log(`  NEW   ${label}  staff#${staffRow.id}`); created++; }
    else {
      const {data, error} = await service!.auth.admin.createUser({
        email,
        password: PROVISIONING_PASSWORD,
        email_confirm: true,
        user_metadata: {full_name: p.name},
      });
      if (error || !data.user) { log(`  FAIL  ${label}  — ${error?.message ?? 'no user returned'}`); failed++; continue; }
      try {
        await db.insert(appUsers).values({
          email, name: p.name, supabaseUserId: data.user.id, staffId: staffRow.id,
          role: p.role, department: p.department, reportingManager: p.manager,
          studio: p.studios[0] ?? null, studios: p.studios,
          mustChangePassword: true, active: true,
        });
        log(`  NEW   ${label}  staff#${staffRow.id}`);
        created++;
      } catch (e) {
        // Never leave an orphaned auth user behind if the profile insert fails.
        await service!.auth.admin.deleteUser(data.user.id).catch(() => {});
        log(`  FAIL  ${label}  — ${e instanceof Error ? e.message : String(e)}`);
        failed++;
      }
    }

    if (p.phone && staffRow.phone !== p.phone) {
      if (APPLY) await db.update(staff).set({phone: p.phone}).where(eq(staff.id, staffRow.id));
      phones++;
    }
  }

  log(`\n${created} account(s) ${APPLY ? 'created' : 'to create'}, ${skipped} skipped, ${failed} failed`);
  log(`${phones} phone number(s) ${APPLY ? 'written' : 'to write'} to staff\n`);
  if (!APPLY) log('Nothing was written. Re-run with --apply to commit.\n');
  else log(`Every account starts with "${PROVISIONING_PASSWORD}" and must change it at first sign-in.\n`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
