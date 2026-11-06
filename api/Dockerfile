FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN --mount=type=secret,id=proxy_ca if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --omit=dev
COPY --chown=node:node src ./src
USER node
EXPOSE 4000
CMD ["npm", "start"]
