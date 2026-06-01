FROM node:20-alpine

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package.json /app/package.json
RUN npm install --only=production

COPY server.js /app/server.js

RUN chown -R appuser:appgroup /app
USER appuser

ENV PORT=8000

CMD ["npm", "start"]
