FROM node:16-alpine

ADD ["dist", "/app"]

WORKDIR /app

CMD ["node", "app.js"]
