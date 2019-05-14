FROM node:10.12.0-jessie

COPY . /app

WORKDIR /app

RUN npm install --production

CMD ["npm", "start"]
