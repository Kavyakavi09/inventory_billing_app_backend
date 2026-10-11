# ---- Backend image (Node + Express) ----
# bookworm-slim (not alpine): html-pdf uses PhantomJS, which needs glibc.
# (bullseye is end-of-life and its security repo now returns 404s.)
FROM node:20-bookworm-slim

# PhantomJS ships an old OpenSSL and crashes on newer Debian configs without this
ENV OPENSSL_CONF=/dev/null

# PhantomJS needs fontconfig + fonts to render PDFs
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       fontconfig libfontconfig1 libfreetype6 fonts-liberation bzip2 ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifests first so the dependency layer is cached
# until package*.json changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# The app writes invoice.pdf into /app, so the non-root user must own it
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
