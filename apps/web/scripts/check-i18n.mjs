#!/usr/bin/env node
/**
 * Verifies that every locale has the same set of keys as the reference locale (en).
 *
 * Plural keys (`key_one`, `key_few`, …) are compared by their base key, and each
 * locale must provide exactly the plural categories its language needs according
 * to Intl.PluralRules (e.g. ru: one/few/many/other, zh: other).
 * Interpolation placeholders ({{name}}) must match the reference as well.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n', 'locales');
const REFERENCE = 'en';
const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const PLURAL_RE = new RegExp(`_(${PLURAL_SUFFIXES.join('|')})$`);

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, out);
    else out[path] = String(value);
  }
  return out;
}

function placeholders(text) {
  return [...text.matchAll(/\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g)].map((m) => m[1]).sort();
}

/** Groups flat keys into { base -> { plural: bool, forms: {suffix|'' -> text} } } */
function group(flat) {
  const groups = new Map();
  for (const [key, text] of Object.entries(flat)) {
    const match = key.match(PLURAL_RE);
    const base = match ? key.slice(0, -match[0].length) : key;
    const suffix = match ? match[1] : '';
    if (!groups.has(base)) groups.set(base, { plural: false, forms: {} });
    const g = groups.get(base);
    if (match) g.plural = true;
    g.forms[suffix] = text;
  }
  return groups;
}

const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));
const locales = Object.fromEntries(
  files.map((f) => {
    const code = basename(f, '.json');
    try {
      return [code, group(flatten(JSON.parse(readFileSync(join(LOCALES_DIR, f), 'utf8'))))];
    } catch (error) {
      console.error(`✖ ${f}: invalid JSON — ${error.message}`);
      process.exit(1);
    }
  }),
);

const reference = locales[REFERENCE];
if (!reference) {
  console.error(`✖ Reference locale "${REFERENCE}.json" not found`);
  process.exit(1);
}

let errors = 0;
const report = (code, message) => {
  errors += 1;
  console.error(`✖ [${code}] ${message}`);
};

for (const [code, groups] of Object.entries(locales)) {
  const categories = new Intl.PluralRules(code).resolvedOptions().pluralCategories;

  for (const [base, ref] of reference) {
    const g = groups.get(base);
    if (!g) {
      report(code, `missing key "${base}"`);
      continue;
    }
    if (ref.plural !== g.plural) {
      report(code, `"${base}" must ${ref.plural ? '' : 'not '}be a plural key`);
      continue;
    }
    if (g.plural) {
      for (const cat of categories) {
        if (!(cat in g.forms)) report(code, `"${base}" is missing plural form "_${cat}"`);
      }
      for (const suffix of Object.keys(g.forms)) {
        if (!categories.includes(suffix))
          report(code, `"${base}_${suffix}" is not used by ${code} plural rules`);
      }
    }
    const refVars = new Set(Object.values(ref.forms).flatMap(placeholders));
    const vars = new Set(Object.values(g.forms).flatMap(placeholders));
    for (const v of refVars) {
      if (!vars.has(v) && !(g.plural && v === 'count'))
        report(code, `"${base}" is missing placeholder {{${v}}}`);
    }
    for (const v of vars) {
      if (!refVars.has(v)) report(code, `"${base}" has unknown placeholder {{${v}}}`);
    }
    for (const [suffix, text] of Object.entries(g.forms)) {
      if (text.trim() === '') report(code, `"${base}${suffix ? `_${suffix}` : ''}" is empty`);
    }
  }

  for (const base of groups.keys()) {
    if (!reference.has(base)) report(code, `extra key "${base}" not present in ${REFERENCE}.json`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} problem(s) found in ${files.length} locale files.`);
  process.exit(1);
}
console.log(`✔ ${files.length} locales are consistent (${reference.size} keys each).`);
