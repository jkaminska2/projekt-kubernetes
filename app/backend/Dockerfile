FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --only=production

COPY server.js /app/server.js

ENV PORT=8000

CMD ["npm", "start"]