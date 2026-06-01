FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --only=production

COPY worker.js /app/worker.js

CMD ["npm", "start"]