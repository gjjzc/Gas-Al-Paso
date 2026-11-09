FROM node:24-alpine
WORKDIR /app
# Vite necesita escribir su caché; dejar la aplicación a nombre del usuario node.
COPY --chown=node:node . .
RUN npm ci && npm cache clean --force && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]
