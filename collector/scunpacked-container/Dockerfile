FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs ./server.mjs
EXPOSE 8787
CMD ["node", "server.mjs"]
