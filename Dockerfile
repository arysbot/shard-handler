FROM node:12.2.0-alpine

COPY . /app

WORKDIR /app

RUN npm install --production

CMD ["npm", "start"]
