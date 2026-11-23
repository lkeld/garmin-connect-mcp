FROM node:26-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    AUTH_WORKER_PYTHON=/opt/auth-venv/bin/python \
    AUTH_WORKER_PATH=/app/auth-worker/worker.py
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY auth-worker/requirements.txt ./auth-worker/requirements.txt
RUN python3 -m venv /opt/auth-venv \
    && /opt/auth-venv/bin/pip install --no-cache-dir -r /app/auth-worker/requirements.txt
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node auth-worker/worker.py ./auth-worker/worker.py
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
