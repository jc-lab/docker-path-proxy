FROM node:16-alpine as builder

RUN mkdir -p /work
WORKDIR "/work"
ADD [".", "/work/"]

RUN yarn install

RUN yarn build

FROM node:16-alpine

COPY --from=builder ["/work/dist", "/app/"]
COPY --from=builder ["/work/package.json", "/work/yarn.lock", "/work/.yarnrc.yml", "/app/"]
COPY --from=builder ["/work/.yarn", "/app/.yarn"]

WORKDIR /app

RUN yarn workspaces focus --production && \
    rm -rf .yarn
CMD ["node", "app.js"]
