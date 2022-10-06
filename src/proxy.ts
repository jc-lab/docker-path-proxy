import * as tls from 'tls';
import * as url from 'url';
import * as https from 'https';
import express from 'express';
import * as httpProxyMiddleware from 'http-proxy-middleware';
import * as env from './env';
import {
  Config,
  loadConfigFromFile
} from './config';

export interface RegistryHolder {
  path: string;
  proxy: httpProxyMiddleware.RequestHandler;
}

export interface DockerPathProxyConfig extends Config {

}

export class DockerPathProxy {
  private readonly _config: DockerPathProxyConfig;
  private readonly _httpsAgent: https.Agent;

  private _registries: RegistryHolder[];
  private _cachedDefaultBackends: Record<string, RegistryHolder> = {};

  constructor(config: DockerPathProxyConfig) {
    this._config = config;

    const caCertificates = [
      ...tls.rootCertificates,
      ...config.caCertificates
    ];
    const httpsAgent = new https.Agent({
      ca: caCertificates
    });
    this._httpsAgent = httpsAgent;

    this._registries = config.registries.map(v => {
      const parsedUrl = new url.URL(v.endpoint);
      const protocol = parsedUrl.protocol.toLowerCase();
      const agent = (protocol === 'http') ? undefined : (() => {
        if (v.skipVerify) {
          return new https.Agent({
            ca: caCertificates,
            rejectUnauthorized: false
          });
        }
        return httpsAgent;
      })();

      return {
        path: v.path,
        proxy: httpProxyMiddleware.createProxyMiddleware({
          agent: agent,
          target: v.endpoint,
          changeOrigin: true,
          pathRewrite(path, req) {
            const targetUrl = (req as any).targetUrl;
            return targetUrl;
          },
          onProxyReq(clientReq, req, res) {
            if (v.username || v.password) {
              const encodedUsername = encodeURIComponent(v.username);
              const authorization = `basic ${Buffer.from(`${encodedUsername}:${v.password}`).toString('base64')}`;
              clientReq.setHeader('authorization', authorization)
            }
          }
        })
      } as RegistryHolder;
    });
  }

  public proxy(subPath: string, req: express.Request, res: express.Response, next: express.NextFunction): RegistryHolder | null {
    const pathTokens = subPath.split('/');
    const userAgent = req.headers['user-agent'] || '';

    // Do not allow connections from docker 1.5 and earlier
    // docker pre-1.6.0 did not properly set the user agent on ping, catch "Go *" user agents
    if (/^(docker\/1\.(3|4|5(?!\.[0-9]-dev))|Go ).*$/.test(userAgent)) {
      res
        .status(404)
        .send();
      return ;
    }

    const registryName = pathTokens.shift() || '';
    let registry = this._registries.find(v => v.path === registryName);
    if (!registry) {
      registry = this.makeDefaultBackend(registryName);
    }
    if (!registry) {
      console.log(`${new Date().getTime()}: Cannot find registry: ${registryName}`);
      res
        .status(404)
        .send();
      return ;
    }

    (req as any).targetUrl = '/' + pathTokens.join('/');
    registry.proxy(req, res, next);
  }

  private makeDefaultBackend(registryName: string): RegistryHolder | null {
    if (this._config.defaultBackend?.disabled) {
      return null;
    }

    if (this._cachedDefaultBackends[registryName]) {
      return this._cachedDefaultBackends[registryName];
    }
    const holder: RegistryHolder = {
      path: registryName,
      proxy: httpProxyMiddleware.createProxyMiddleware({
        agent: this._httpsAgent,
        target: `https://${registryName}/v2/`,
        changeOrigin: true,
        pathRewrite(path, req) {
          const targetUrl = (req as any).targetUrl;
          return targetUrl;
        }
      })
    };
    this._cachedDefaultBackends[registryName] = holder;
    return holder;
  }
}
