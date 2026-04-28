FROM node:20-alpine

WORKDIR /app

# Install server dependencies (root package.json holds backend deps)
COPY package.json package-lock.json ./
RUN npm ci

COPY server ./server

EXPOSE 3000

CMD ["node", "server/src/app.js"]

