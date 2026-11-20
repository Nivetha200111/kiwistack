// The Claude plugin directory's rules for plugins that aren't from a Verified organization, as checks.
// Only text and images: no hooks, no local MCP servers, no scripts, no fields Claude Code doesn't read,
// and a square PNG icon. Used by lint-skills.mjs on plugins/kiwistack-skills.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';

const TEXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const REFUSED_NAMES = new Set(['hooks.json', '.mcp.json', '.lsp.json', 'monitors.json', 'package.json', 'package-lock.json',
  'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'yarn.lock', '.npmrc', '.yarnrc', '.yarnrc.yml', 'bunfig.toml']);
const PLUGIN_FIELDS = new Set(['name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'icon']);
const SAFE_PATH = /^[A-Za-z0-9._\-/]+$/;

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

function pngSize(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig || buf.subarray(12, 16).toString('latin1') !== 'IHDR') return null;
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Returns [file, message] pairs for every rule the plugin folder breaks. */
export function checkDirectoryRules(dir) {
  const problems = [];
  const bad = (file, msg) => problems.push([file, msg]);
  const utf8 = new TextDecoder('utf-8', { fatal: true });

  for (const file of files(dir)) {
    const rel = relative(dir, file).replaceAll('\\', '/');
    const name = basename(file);
    const ext = extname(file).toLowerCase();
    if (!SAFE_PATH.test(rel)) bad(file, 'path has a character not every computer keeps; use letters, digits, ".", "-" and "_"');
    if (REFUSED_NAMES.has(name)) bad(file, `${name} isn't accepted from unverified organizations; remove it`);
    if (rel.split('/').includes('hooks')) bad(file, "hooks aren't accepted from unverified organizations");
    if (rel.startsWith('.claude/')) bad(file, 'a .claude folder in the plugin is refused; put skills in skills/');
    if (!TEXT.has(ext) && !IMAGE.has(ext)) {
      bad(file, `${ext || 'a file with no extension'} isn't accepted: only Markdown, text, JSON, YAML and PNG, JPEG, GIF, WebP or ICO images`);
      continue;
    }
    const buf = readFileSync(file);
    if (TEXT.has(ext)) {
      if (buf.includes(0)) bad(file, 'has a NUL byte');
      let text = '';
      try { text = utf8.decode(buf); } catch { bad(file, 'is not valid UTF-8'); continue; }
      if (text.startsWith('#!')) bad(file, 'starts with #!');
    }
    if (rel.startsWith('.claude-plugin/') && name !== 'plugin.json' && !IMAGE.has(ext)) {
      bad(file, '.claude-plugin may hold only plugin.json and images');
    }
  }

  const manifest = join(dir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) bad(dir, 'no .claude-plugin/plugin.json');
  else {
    const json = JSON.parse(readFileSync(manifest, 'utf8'));
    for (const k of Object.keys(json)) if (!PLUGIN_FIELDS.has(k)) bad(manifest, `field "${k}" isn't on the allowed list`);
  }

  const icon = join(dir, '.claude-plugin', 'icon.png');
  if (!existsSync(icon)) bad(dir, 'no .claude-plugin/icon.png (a square PNG, 512 to 2048 px, under 2 MB)');
  else {
    const buf = readFileSync(icon);
    const size = pngSize(buf);
    if (!size) bad(icon, 'is not a PNG');
    else if (size.w !== size.h || size.w < 512 || size.w > 2048) bad(icon, `is ${size.w}x${size.h}; it must be square, 512 to 2048 px`);
    if (buf.length >= 2 * 1024 * 1024) bad(icon, 'is 2 MB or more');
  }
  return problems;
}
