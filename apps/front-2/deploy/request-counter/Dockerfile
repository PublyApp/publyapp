FROM node:24-alpine@sha256:156b55f92e98ccd5ef49578a8cea0df4679826564bad1c9d4ef04462b9f0ded6

RUN apk add --no-cache openssl

WORKDIR /app
COPY server.mjs control-routes.mjs ./

USER node
EXPOSE 8800 9443
CMD ["node", "server.mjs"]
