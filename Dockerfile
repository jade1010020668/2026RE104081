# Imagen para desplegar el quiz en Hugging Face Spaces (SDK: Docker)
# o en cualquier servicio que ejecute contenedores.
FROM node:20-slim

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
USER node
RUN npm ci --omit=dev

COPY --chown=node:node . .

# Hugging Face Spaces expone las aplicaciones en el puerto 7860.
ENV PORT=7860
EXPOSE 7860

CMD ["node", "server.js"]
