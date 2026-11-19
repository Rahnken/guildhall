FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Generating the client and building need a database URL but no database.
ENV DATABASE_URL="file:/tmp/build.db"
RUN npx prisma generate && npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
# node_modules comes along for the Prisma CLI, which applies migrations on start.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output
COPY package.json prisma.config.ts ./
COPY prisma ./prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node .output/server/index.mjs"]
