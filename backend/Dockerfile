FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY src ./src

EXPOSE 3001

# Auto-migrate then start
CMD ["sh", "-c", "node src/db/migrate.js && node src/index.js"]
