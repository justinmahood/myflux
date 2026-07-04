# Build the optimized bundle, then serve it with nginx.
# Cloud Run injects PORT (default 8080); nginx listens on it via the
# official image's envsubst template mechanism.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
ENV PORT=8080
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
