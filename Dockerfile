FROM node:20-alpine AS builder

WORKDIR /app

ENV DATABASE_URL="file:./dev.db"

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build
RUN npx prisma db push && npx prisma db seed

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="file:./dev.db"

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma/dev.db ./prisma/dev.db.template

COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
