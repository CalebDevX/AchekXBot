FROM node:22-alpine

RUN apk add --no-cache git ffmpeg libwebp-tools python3 make g++

# Point this to YOUR NEW REPO
ADD https://api.github.com/repos/CalebDevX/AchekXBot/git/refs/heads/main version.json
RUN git clone -b main https://github.com/CalebDevX/AchekXBot /rgnk

WORKDIR /rgnk
RUN mkdir -p temp
ENV TZ=Africa/Lagos
RUN npm install -g --force yarn pm2
RUN yarn install
CMD ["npm", "start"]
