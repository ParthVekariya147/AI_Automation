FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/ ./packages/
COPY tsconfig.base.json ./

RUN npm install

COPY apps/api/ ./apps/api/

RUN npm run build --workspace api

EXPOSE 4000

CMD ["node", "apps/api/dist/index.js"]
