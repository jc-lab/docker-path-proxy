import express from 'express';
import * as env from './env';
import {loadConfigFromFile} from './config';
import {DockerPathProxy} from './proxy';

(async () => {
  const config = await loadConfigFromFile(env.CONFIG_FILE);
  const proxy = new DockerPathProxy(config);

  const app = express();

  app.use((req, res, next) => {
    const {ip, method, originalUrl} = req;
    const userAgent = req.get('user-agent') || '';

    res.on('finish', () => {
      const {statusCode} = res;
      const contentLength = res.get('content-length');

      console.log(
        `${new Date().getTime()}: ${method} ${originalUrl} ${statusCode} ${contentLength} - ${userAgent} ${ip}`,
      );
    });

    next();
  });

  app.all('/v2/:subPath(*)', (req, res, next) => {
    const subPath = req.params.subPath || '';
    proxy.proxy(subPath, req, res, next);
  });

  app.listen(env.PORT, () => {
    console.log(`${new Date().getTime()}: Start listen port ${env.PORT}`);
  });
})();
