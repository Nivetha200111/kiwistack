// @ts-check
// Local file input and output for large payloads (bundles, compositions, big records), so
// the agent passes a path instead of pasting tens of kilobytes into a tool call.
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { isAbsolute, dirname, extname } from 'node:path';
import { GuardError } from './guard.mjs';

const MAX_BYTES = 16 * 1024 * 1024;

function checkPath(path, what) {
  if (typeof path !== 'string' || !isAbsolute(path)) throw new GuardError('BAD_INPUT', `${what} must be an absolute path, got "${path}".`);
}

export function readTextFile(path, what = 'path') {
  checkPath(path, what);
  let size;
  try {
    size = statSync(path).size;
  } catch {
    throw new GuardError('BAD_INPUT', `${what} ${path} does not exist.`);
  }
  if (size > MAX_BYTES) throw new GuardError('BAD_INPUT', `${what} ${path} is ${size} bytes; the limit is ${MAX_BYTES}.`);
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

export function readJsonFile(path, what = 'path') {
  const text = readTextFile(path, what);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GuardError('BAD_INPUT', `${what} ${path} is not valid JSON: ${/** @type {Error} */ (e).message}`);
  }
}

/** Writes pretty JSON to an absolute .json path and returns its size. */
export function writeJsonFile(path, value, what = 'out_path') {
  checkPath(path, what);
  if (extname(path).toLowerCase() !== '.json') throw new GuardError('BAD_INPUT', `${what} must end in .json.`);
  mkdirSync(dirname(path), { recursive: true });
  const text = JSON.stringify(value, null, 2);
  writeFileSync(path, text, 'utf8');
  return Buffer.byteLength(text);
}

/**
 * Applies { field: absolute path } so each field's value is the file's text. A .json file
 * is re-serialised compactly, which is how ServiceNow stores JSON fields such as a composition.
 */
export function valuesFromFiles(map) {
  const out = {};
  for (const [field, path] of Object.entries(map || {})) {
    const text = readTextFile(path, `values_from_files.${field}`);
    if (extname(path).toLowerCase() === '.json') {
      try {
        const parsed = JSON.parse(text);
        out[field] = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
        continue;
      } catch (e) {
        throw new GuardError('BAD_INPUT', `values_from_files.${field}: ${path} is not valid JSON: ${/** @type {Error} */ (e).message}`);
      }
    }
    out[field] = text;
  }
  return out;
}
