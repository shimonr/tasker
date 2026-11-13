FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Empty by default: the app then calls same-origin /api, which nginx proxies to the backend.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Sub-path the app is served under (e.g. /tasker); the proxy in front strips it before nginx.
ARG VITE_BASE_PATH=
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build

FROM nginx:1.27-alpine
# Rendered at startup with envsubst; API_UPSTREAM is where /api requests are forwarded.
ENV API_UPSTREAM=http://backend:8000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1/healthz >/dev/null || exit 1
