/**
 * Translation completeness check.
 *
 * Run with `npm --prefix frontend run check:i18n`. Three failure classes, all
 * of which are invisible until a user is looking at the screen in Sinhala:
 *
 *   1. A key called from source that no dictionary defines. `t()` renders the
 *      key itself, so the page shows `mail.subject` to a clerk. This is the
 *      failure that matters most and the reason this script exists.
 *   2. A key defined in `en.js` that no source file calls. Almost always a
 *      leftover from a string that moved, and it means the dictionary is
 *      larger than the app — which quietly rots.
 *   3. A U+FFFD replacement character in either dictionary. Those come from a
 *      shell that mangled UTF-8 on write, and they render as a diamond. Every
 *      Sinhala file gets checked rather than trusted.
 *
 * The scan is textual and only understands the two call shapes the codebase
 * uses: `t('key')` and `t(\`key\`)`. Template keys built at runtime from a value
 * (`t(\`status.${status}\`)` in the badges) cannot be resolved statically, so
 * they are reported separately as "dynamic" rather than being reported as
 * failures — those are verified by the parity check below, which does know
 * every concrete key. Nothing else is treated as evidence either way.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');
const DICTIONARIES = { en: join(SRC, 'i18n', 'en.js'), si: join(SRC, 'i18n', 'si.js') };

/** Source files worth scanning: everything that could render a string. */
const SCANNED = /\.(jsx?|js)$/;

/**
 * Keys built by interpolation cannot be resolved at build time, so they are
 * excluded from the literal scan and instead checked by prefix parity.
 */
const DYNAMIC_KEYS = [
  { key: 'status', source: 'StatusBadge.jsx' },
  { key: 'priority', source: 'PriorityBadge.jsx' },
  { key: 'role', source: 'RoleBadge.jsx' },
];

async function sourceFiles(dir) {
  const out = [];

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (SCANNED.test(entry.name)) out.push(path);
  }

  return out;
}

/**
 * The source text of every `t(...)` key argument.
 *
 * Reading a regex like /\bt\('([^']+)'\)/ is not enough for this codebase. Keys
 * are also passed as a ternary (`t(open ? 'nav.openMenu' : 'nav.closeMenu')`), as
 * a template built from a runtime value (`t(\`status.${status}\`)`), and with an
 * options object (`t('auth.failed', { status })`). A regex that only matches the
 * first shape reports a false pass on files that are partly untranslated, which
 * is the one failure mode this script exists to prevent.
 *
 * So this walks the call instead: from the `(` it tracks nesting while skipping
 * over string bodies, then keeps only what comes before the first top-level
 * comma. That last part matters — an options object can contain unrelated
 * literals, and counting those as keys would invent failures.
 */
function keyArguments(code) {
  const parts = [];

  for (const match of code.matchAll(/(^|[^\w$.])t\(/g)) {
    let depth = 1;
    let index = match.index + match[0].length;
    let argument = '';

    while (index < code.length && depth > 0) {
      const char = code[index];

      if (char === "'" || char === '"' || char === '`') {
        const quote = char;
        argument += char;
        index += 1;

        while (index < code.length) {
          argument += code[index];

          if (code[index] === '\\') {
            argument += code[index + 1] ?? '';
            index += 2;
            continue;
          }

          if (code[index] === quote) {
            index += 1;
            break;
          }

          index += 1;
        }

        continue;
      }

      if (char === '(' || char === '[' || char === '{') depth += 1;
      else if (char === ')' || char === ']' || char === '}') depth -= 1;

      if (depth === 0) break;

      argument += char;
      index += 1;
    }

    const comma = argument.indexOf(',');
    parts.push(comma === -1 ? argument : argument.slice(0, comma));
  }

  return parts;
}

/** Split key arguments into the literal keys used and the prefixes built at runtime. */
function keysIn(code) {
  const used = new Set();
  const dynamic = new Set();

  for (const argument of keyArguments(code)) {
    const literals = [...argument.matchAll(/['"]([^'"]*)['"]/g)].map((match) => match[1]);

    if (argument.includes('${')) {
      // A template: keep the static prefix before the interpolation, so
      // `status.${status}` becomes `status`.
      const prefix = literals[0] ?? '';

      if (prefix) dynamic.add(prefix.endsWith('.') ? prefix.slice(0, -1) : prefix);
      continue;
    }

    // Either one key, or both arms of a ternary.
    for (const literal of literals) {
      if (literal) used.add(literal);
    }
  }

  return { used, dynamic };
}

const failures = [];
const notes = [];

/* 1. Load both dictionaries. They are real modules, so importing them checks
   that they still parse as well as giving us the key sets. The export is
   named rather than default, and the name is not something the check should
   care about, so the single exported object is taken from the namespace. */
const dictionaries = {};

for (const [language, path] of Object.entries(DICTIONARIES)) {
  const text = await readFile(path, 'utf8');

  if (text.includes('\uFFFD')) {
    const count = (text.match(/\uFFFD/g) ?? []).length;
    failures.push(`${language}.js contains ${count} U+FFFD replacement character(s)`);
  }

  const module = await import(`file://${path}`);
  const exported = Object.values(module).find(
    (value) => value && typeof value === 'object' && !Array.isArray(value),
  );

  if (!exported) {
    failures.push(`${language}.js exports no dictionary object`);
    continue;
  }

  dictionaries[language] = exported;
}

/* 2. Parity: same key set on both sides, and no empty values. */
const enKeys = new Set(Object.keys(dictionaries.en));
const siKeys = new Set(Object.keys(dictionaries.si));

for (const key of enKeys) if (!siKeys.has(key)) failures.push(`si.js is missing "${key}"`);
for (const key of siKeys) if (!enKeys.has(key)) failures.push(`si.js has an extra key "${key}"`);

for (const [language, dictionary] of Object.entries(dictionaries)) {
  if (!dictionary) continue;

  for (const [key, value] of Object.entries(dictionary)) {
    if (typeof value !== 'string' || value.trim() === '') {
      failures.push(`${language}.js key "${key}" is empty`);
    }
  }
}

/* 3. Scan source for literal keys. */
const used = new Set();
const dynamic = new Set();

for (const file of await sourceFiles(SRC)) {
  const path = relative(SRC, file);

  if (path.startsWith('i18n\\') || path.startsWith('i18n/')) continue;

  const { used: fileUsed, dynamic: fileDynamic } = keysIn(await readFile(file, 'utf8'));

  for (const key of fileUsed) {
    used.add(key);
    if (!enKeys.has(key)) failures.push(`${path} calls t('${key}') but en.js has no such key`);
  }

  for (const prefix of fileDynamic) dynamic.add(prefix);
}

/* 4. A dynamic prefix is only safe if some key under it exists, since that is
   what proves the interpolation was built from a known set. */
for (const prefix of dynamic) {
  const any = [...enKeys].some((key) => key.startsWith(`${prefix}.`));
  if (!any) failures.push(`a dynamic t(\`${prefix}....\`) call has no matching keys in en.js`);
}

for (const { key, source } of DYNAMIC_KEYS) {
  const count = [...enKeys].filter((k) => k.startsWith(`${key}.`)).length;
  notes.push(`${key}: ${count} concrete keys resolved at runtime (${source})`);
}

/* 5. Unused keys are a warning rather than a failure: a dictionary may
   legitimately carry a label the UI reaches through a prop. */
const unused = [...enKeys].filter((key) => !used.has(key));

/* Report. */
for (const note of notes) console.log(`  note: ${note}`);

/* The unused list is the to-do list for the translation work, so it is worth
   printing while that work is in progress and is pure noise once it is done.
   Cap it: a full list of 270 keys is not a more useful signal than a count. */
const UNUSED_PREVIEW = 12;

if (unused.length) {
  const shown = unused.slice(0, UNUSED_PREVIEW);
  const rest = unused.length - shown.length;

  console.log(
    `  note: ${unused.length} key(s) defined but not yet called from source: ${shown.join(', ')}` +
      (rest > 0 ? `, +${rest} more` : ''),
  );
}

if (failures.length) {
  console.error(`\ni18n check FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`i18n check passed: ${enKeys.size} keys, ${used.size} referenced, en/si in parity.`);