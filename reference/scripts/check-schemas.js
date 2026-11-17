#!/usr/bin/env node
// Check the example records and the example JEP transcript against the JSON
// Schemas in ../../schemas, with a small validator for the subset of JSON
// Schema 2020-12 those schemas use. No dependencies.

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (...p) => JSON.parse(readFileSync(join(ROOT, ...p), 'utf8'));

const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function validate(root, schema, value, path = '$') {
  const errors = [];
  const resolveRef = (ref) => {
    if (!ref.startsWith('#/')) throw new Error(`only local $ref is supported: ${ref}`);
    return ref.slice(2).split('/').reduce((node, key) => node[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
  };
  const walk = (s, v, p) => {
    if (s === true) return true;
    if (s === false) {
      errors.push(`${p}: not allowed`);
      return false;
    }
    const before = errors.length;
    if (s.$ref) walk(resolveRef(s.$ref), v, p);
    if (s.type) {
      const types = Array.isArray(s.type) ? s.type : [s.type];
      const t = typeOf(v);
      if (!types.includes(t) && !(t === 'integer' && types.includes('number'))) errors.push(`${p}: expected ${types.join('|')}, got ${t}`);
    }
    if ('const' in s && !equal(s.const, v)) errors.push(`${p}: expected ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some((e) => equal(e, v))) errors.push(`${p}: not one of ${JSON.stringify(s.enum)}`);
    if (typeof v === 'string') {
      if (s.pattern && !new RegExp(s.pattern, 'u').test(v)) errors.push(`${p}: does not match ${s.pattern}`);
      if (s.minLength !== undefined && [...v].length < s.minLength) errors.push(`${p}: shorter than ${s.minLength}`);
    }
    if (typeof v === 'number') {
      if (s.minimum !== undefined && v < s.minimum) errors.push(`${p}: below ${s.minimum}`);
      if (s.maximum !== undefined && v > s.maximum) errors.push(`${p}: above ${s.maximum}`);
    }
    if (Array.isArray(v)) {
      if (s.minItems !== undefined && v.length < s.minItems) errors.push(`${p}: fewer than ${s.minItems} items`);
      if (s.maxItems !== undefined && v.length > s.maxItems) errors.push(`${p}: more than ${s.maxItems} items`);
      if (s.items !== undefined) v.forEach((x, i) => walk(s.items, x, `${p}[${i}]`));
    }
    if (typeOf(v) === 'object') {
      for (const k of s.required ?? []) if (!(k in v)) errors.push(`${p}: missing "${k}"`);
      for (const [k, x] of Object.entries(v)) {
        if (s.propertyNames) walk(s.propertyNames, k, `${p}.${k} (name)`);
        if (s.properties && k in s.properties) walk(s.properties[k], x, `${p}.${k}`);
        else if (s.additionalProperties !== undefined) walk(s.additionalProperties, x, `${p}.${k}`);
      }
    }
    const passes = (sub) => validate(root, sub, v, p).length === 0;
    for (const sub of s.allOf ?? []) walk(sub, v, p);
    if (s.anyOf && !s.anyOf.some(passes)) errors.push(`${p}: matches none of anyOf`);
    if (s.oneOf) {
      const n = s.oneOf.filter(passes).length;
      if (n !== 1) errors.push(`${p}: matches ${n} of oneOf, expected exactly 1`);
    }
    if (s.not && passes(s.not)) errors.push(`${p}: matches a forbidden schema`);
    if (s.if) walk(passes(s.if) ? s.then ?? true : s.else ?? true, v, p);
    return errors.length === before;
  };
  walk(schema, value, path);
  return errors;
}

const jgr = load('schemas', 'jgr.schema.json');
const jep = load('schemas', 'jep.schema.json');
let checked = 0;
const problems = [];
const expect = (label, errors, shouldPass = true) => {
  checked++;
  if (shouldPass && errors.length) problems.push(`${label}: ${errors.slice(0, 3).join('; ')}`);
  if (!shouldPass && !errors.length) problems.push(`${label}: passed the schema but should not`);
};

for (const dir of [['examples', 'demo-match'], ['conformance', 'records']]) {
  for (const file of readdirSync(join(ROOT, ...dir)).filter((f) => f.endsWith('.jgr'))) {
    const shouldPass = !file.startsWith('invalid-layout-in-player-view');
    expect(`${dir.join('/')}/${file}`, validate(jgr, jgr, load(...dir, file)), shouldPass);
  }
}

const hostSchema = { ...jep, $ref: '#/$defs/host_message', anyOf: undefined };
const engineSchema = { ...jep, $ref: '#/$defs/engine_message', anyOf: undefined };
const transcript = readFileSync(join(ROOT, 'examples', 'demo-match', 'jep-transcript.log'), 'utf8').trim().split('\n');
for (const [i, line] of transcript.entries()) {
  const m = line.match(/^(>>|<<) (\w+) (.*)$/);
  if (!m) continue;
  const message = JSON.parse(m[3]);
  expect(`transcript line ${i + 1}`, validate(jep, m[1] === '>>' ? hostSchema : engineSchema, message));
}
const opening = load('examples', 'analysis', 'opening-candidates.json');
expect('opening-candidates info', validate(jep, engineSchema, opening.info));
expect('opening-candidates move', validate(jep, engineSchema, opening.move));
expect('a host hello is not an engine hello', validate(jep, engineSchema, { type: 'hello', protocol: 'jep' }), false);
expect('a bad decision is rejected', validate(jep, engineSchema, { type: 'move', move: 'h2e2=C' }), false);

console.log(`${checked - problems.length} of ${checked} schema checks passed`);
for (const p of problems) console.log(`  FAIL ${p}`);
process.exitCode = problems.length ? 1 : 0;
