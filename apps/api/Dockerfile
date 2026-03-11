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
ARG GIT_SHA=unknown
ENV LANDWATCH_BUILD_SHA=$GIT_SHA

COPY package*.json ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

# sqlclient_bridge requires PowerShell Core on Linux.
RUN apk add --no-cache \
    ca-certificates \
    curl \
    icu-libs \
    krb5-libs \
    libgcc \
    libintl \
    libstdc++ \
    tzdata \
    zlib \
  && POWERSHELL_VERSION=7.4.7 \
  && curl -fSL "https://github.com/PowerShell/PowerShell/releases/download/v${POWERSHELL_VERSION}/powershell-${POWERSHELL_VERSION}-linux-musl-x64.tar.gz" -o /tmp/powershell.tar.gz \
  && mkdir -p /opt/microsoft/powershell/7 \
  && tar -xzf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 \
  && chmod +x /opt/microsoft/powershell/7/pwsh \
  && ln -s /opt/microsoft/powershell/7/pwsh /usr/bin/pwsh \
  && rm -f /tmp/powershell.tar.gz

USER node
EXPOSE 3001
CMD ["node", "dist/main"]
