FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY vendor /vendor
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

USER node
EXPOSE 3001
CMD ["node", "dist/main"]
