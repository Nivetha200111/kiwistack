// @ts-check
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.code = 'CONFIG';
  }
}

export function kiwiHome(env = process.env) {
  return env.KIWISTACK_HOME || join(homedir(), '.kiwistack');
}

/** Parses KEY=VALUE lines. Blank lines and # comments are skipped. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

const FORBIDDEN_ENVIRONMENTS = new Set(['prod', 'production', 'live']);

/**
 * Loads ~/.kiwistack/config.json and ~/.kiwistack/secrets.env.
 * Returns a resolver that yields one instance profile by name.
 */
export function loadConfig(env = process.env) {
  const home = kiwiHome(env);
  const configPath = join(home, 'config.json');
  if (!existsSync(configPath)) {
    throw new ConfigError(`No kiwistack config at ${configPath}. Run /setup-kiwistack.`);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const secretsPath = join(home, 'secrets.env');
  const fileSecrets = existsSync(secretsPath) ? parseEnvFile(readFileSync(secretsPath, 'utf8')) : {};
  const secrets = { ...fileSecrets, ...env };
  return { home, config: validateConfig(config), secrets };
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || !config.instances || typeof config.instances !== 'object') {
    throw new ConfigError('config.json needs an "instances" object.');
  }
  for (const [name, inst] of Object.entries(config.instances)) {
    if (!inst.host || !/^[a-z0-9.-]+$/i.test(inst.host)) throw new ConfigError(`instances.${name}.host is missing or invalid.`);
    if (!inst.environment) throw new ConfigError(`instances.${name}.environment is required (dev, test, sandbox).`);
    if (FORBIDDEN_ENVIRONMENTS.has(String(inst.environment).toLowerCase())) {
      throw new ConfigError(`instances.${name} is marked ${inst.environment}. kiwistack never connects to production.`);
    }
    if (!inst.scope) throw new ConfigError(`instances.${name}.scope is required (the target app scope, e.g. x_acme_kiwi).`);
    if (inst.pdi === true && !/^dev\d+\.service-now\.com$/i.test(inst.host)) {
      throw new ConfigError(`instances.${name} is marked "pdi" but ${inst.host} is not a devNNNN.service-now.com host.`);
    }
    const grant = inst.auth?.grant;
    if (grant !== 'client_credentials' && grant !== 'password') {
      throw new ConfigError(`instances.${name}.auth.grant must be "client_credentials" or "password".`);
    }
  }
  if (config.default && !config.instances[config.default]) {
    throw new ConfigError(`default "${config.default}" is not one of the configured instances.`);
  }
  return config;
}

export function resolveInstance(loaded, name) {
  const { config } = loaded;
  const key = name || config.default || Object.keys(config.instances)[0];
  const inst = config.instances[key];
  if (!inst) {
    throw new ConfigError(`Instance "${key}" is not in the allowlist. Configured: ${Object.keys(config.instances).join(', ')}.`);
  }
  return { name: key, ...inst };
}

export function secret(loaded, envName, label) {
  const value = envName ? loaded.secrets[envName] : undefined;
  if (!value) throw new ConfigError(`Missing ${label}: set ${envName || '(no env name configured)'} in your environment or ${join(loaded.home, 'secrets.env')}.`);
  return value;
}
