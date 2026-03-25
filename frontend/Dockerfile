FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY public ./public
COPY src ./src

# REACT_APP_* vars must be present at npm start time (CRA dev server reads them live)
ENV REACT_APP_API_URL=http://localhost:3001

EXPOSE 3000

CMD ["npm", "start"]
