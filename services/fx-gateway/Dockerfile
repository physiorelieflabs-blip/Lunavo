FROM node:24-alpine
WORKDIR /app
COPY index.mjs ecb-rates.mjs ./
ENV NODE_ENV=production
EXPOSE 8081
CMD ["node","index.mjs"]
