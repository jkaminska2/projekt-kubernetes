FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --only=production

COPY worker.js /app/worker.js

RUN chown -R appuser:appgroup /app
USER appuser

CMD ["npm", "start"]
