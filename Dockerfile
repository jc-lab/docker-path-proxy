FROM node:16-alpine as builder

RUN mkdir -p /work
WORKDIR "/work"
ADD [".", "/work/"]

RUN yarn install

RUN yarn build

FROM node:16-alpine

COPY --from=builder ["/work/dist", "/app"]

WORKDIR /app

RUN yarn install --production
CMD ["node", "app.js"]
