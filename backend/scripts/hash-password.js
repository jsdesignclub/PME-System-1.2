#!/usr/bin/env node
/**
 * Generate a bcrypt hash for a seed file.
 *
 * A bcrypt hash cannot be computed in SQL, and Phase 0's D10 fixes the seed
 * runner as a plain multi-statement executor. So the hash is generated here and
 * pasted into the seed as a literal (D31). This script exists so nobody
 * hand-edits a hash, which is how a seed ends up with a mangled `$2b$12$...`
 * that bcrypt rejects with an unhelpful error.
 *
 * Usage:
 *   node scripts/hash-password.js 'the-password'   # argument
 *   node scripts/hash-password.js                  # interactive, hidden input
 *   node scripts/hash-password.js --check 'hash'   # verify a password against a hash
 *
 * Note the quoting on the argument form. PowerShell expands `$` inside double
 * quotes, which would corrupt a hash pasted into a double-quoted string; that
 * is a problem when *reading* a hash back, not when producing one here.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { BCRYPT_ROUNDS, hashPassword, verifyPassword } from '../utils/password.js';

async function promptHidden(question) {
  // A plain readline prompt is used deliberately over a masked-input dependency.
  // The password is typed in plain text, which is acceptable for a local
  // developer tool and costs the project a runtime dependency it does not need.
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function usage(message) {
  if (message) console.error(message);
  console.error(
    [
      'Usage:',
      '  node scripts/hash-password.js <password>      hash a password',
      '  node scripts/hash-password.js                 prompt for a password',
      '  node scripts/hash-password.js --check <hash>  verify a password against a hash',
    ].join('\n'),
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--check')) {
    const index = args.indexOf('--check');
    const hash = args[index + 1];
    if (!hash) usage('--check needs a bcrypt hash to compare against.');

    const password = await promptHidden('Password to check: ');
    const ok = await verifyPassword(password, hash);
    console.log(ok ? 'matches' : 'does not match');
    process.exit(ok ? 0 : 1);
  }

  const password = args.length > 0 ? args[0] : await promptHidden('Password to hash: ');

  if (!password) usage('A password is required.');

  const hash = await hashPassword(password);

  console.log('');
  console.log(`  rounds : ${BCRYPT_ROUNDS}`);
  console.log(`  hash   : ${hash}`);
  console.log(`  length : ${hash.length} (bcrypt hashes are always 60)`);
  console.log('');
  console.log('Paste the hash above into the seed file. Do not commit the plaintext');
  console.log('anywhere except as a comment beside it, and never a real password.');
}

main().catch((error) => {
  console.error(`hash-password failed: ${error.message}`);
  process.exit(1);
});
