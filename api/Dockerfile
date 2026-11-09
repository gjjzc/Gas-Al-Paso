FROM node:24-alpine
WORKDIR /app
# Copiar una vez y construir en una sola capa reduce el espacio usado por Docker.
COPY --chown=node:node . .
RUN npm ci --omit=dev && npm cache clean --force && chown -R node:node /app
USER node
EXPOSE 4000
CMD ["npm", "start"]
