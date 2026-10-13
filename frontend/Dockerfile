# Etapa 1 — compila la SPA (tsc + vite build) con las dependencias fijadas en el lockfile.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Etapa 2 — sirve los estáticos con nginx y reenvía la API al backend (ver nginx.conf).
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
