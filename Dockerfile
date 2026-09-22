# 화면(정적 파일)과 게임 서버를 한 이미지에 담습니다. 한 주소에서 모두 제공하므로 CORS 설정이 필요 없습니다.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
COPY scripts ./scripts
RUN npm ci && npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
RUN npm ci --omit=dev
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["npm", "start"]
