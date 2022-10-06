import * as fs from 'fs';
import * as util from 'util';
import * as yaml from 'yaml';

export interface Registry {
  path: string;
  endpoint: string;
  skipVerify: boolean;
  username: string;
  password: string;
  passwordRefFile: string;
  passwordRefEnv: string;
}

export interface DefaultBackend {
  disabled: boolean;
}

export interface Config {
  defaultBackend?: DefaultBackend | null;
  registries: Registry[];
  caCertificates: string[];
}

export function loadConfig(content: string): Promise<Config> {
  const parsed: Config = yaml.parse(content);
  return (parsed.registries || []).reduce((prev, cur) => prev.then((list) => {
    const item: Registry = Object.assign({}, cur);
    if (cur.passwordRefFile) {
      return util.promisify(fs.readFile)(cur.passwordRefFile, { encoding: 'utf-8' })
        .then((password: string) => {
          item.password = password;
          list.push(item);
        });
    } else if (cur.passwordRefEnv) {
      item.password = process.env[cur.passwordRefEnv];
    }
    list.push(item);
    return list;
  }), Promise.resolve([]))
    .then((registries) => {
      const defaultBackend: DefaultBackend = Object.assign({
        disabled: false
      }, parsed.defaultBackend || {});
      return {
        defaultBackend,
        registries,
        caCertificates: parsed.caCertificates || []
      } as Config;
    });
}

export function loadConfigFromFile(file: string): Promise<Config> {
  return util.promisify(fs.readFile)(file, { encoding: 'utf-8' })
    .then((content) => loadConfig(content));
}
