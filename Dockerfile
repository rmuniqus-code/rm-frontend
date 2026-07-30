FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Public — not a secret (safe to bake in per auth-kit docs)
ENV NEXT_PUBLIC_AIU_PUBLISHABLE_KEY=aiu_pk_eyJpIjoiaHR0cHM6Ly9haS11bml2ZXJzZS51bmlxdXMuY29tL2F1dGgvcmVhbG1zL2Nvd29yayIsImMiOiJjb3dvcmstdW5pc291cmNlIiwicCI6Imh0dHBzOi8vYWktdW5pdmVyc2UudW5pcXVzLmNvbS9hdXRoIiwibSI6InBrY2UifQ

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Carry the publishable key into the runner so server-side auth.ts can read it
ENV NEXT_PUBLIC_AIU_PUBLISHABLE_KEY=aiu_pk_eyJpIjoiaHR0cHM6Ly9haS11bml2ZXJzZS51bmlxdXMuY29tL2F1dGgvcmVhbG1zL2Nvd29yayIsImMiOiJjb3dvcmstdW5pc291cmNlIiwicCI6Imh0dHBzOi8vYWktdW5pdmVyc2UudW5pcXVzLmNvbS9hdXRoIiwibSI6InBrY2UifQ

EXPOSE 4000
ENV PORT=4000
# DATABASE_URL must be passed at runtime via Cloud Run env vars / -e flag
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "4000"]
