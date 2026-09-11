FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json tsconfig.base.json eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/mcp-server/package*.json ./apps/mcp-server/
COPY --from=build /app/packages/protocol/package*.json ./packages/protocol/
COPY --from=build /app/apps/mcp-server/dist ./apps/mcp-server/dist
COPY --from=build /app/packages/protocol/dist ./packages/protocol/dist
RUN npm ci --omit=dev
USER node
EXPOSE 3210
CMD ["node", "apps/mcp-server/dist/index.js"]
