# Контейнер API платформы расследований.
#
# Собирается из корня репозитория:
#   docker build -f investigation/deploy/Dockerfile -t investigation-api .

FROM node:22-alpine

# Распознавание текста на сканах живёт прямо в образе: tesseract — обычная программа,
# а не модель на несколько гигабайт, и отдельный контейнер под неё был бы лишней
# движущейся частью. Русские данные обязательны: без них скан читается как латиница.
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-rus tesseract-ocr-data-eng

WORKDIR /app

# Зависимости отдельным слоем: пересобирается только при смене package-lock.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Копируется только то, что нужно серверу: фронтенд SmartOil и его страницы
# к этому образу отношения не имеют.
COPY src/investigation ./src/investigation
COPY investigation/db ./investigation/db
COPY investigation/tools ./investigation/tools

# Оригиналы источников живут на смонтированном томе и переживают пересборку образа.
ENV INVESTIGATION_FILE_ROOT=/var/lib/investigation/sources
VOLUME /var/lib/investigation/sources

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Процесс не запускается от root: компрометация приложения не должна давать
# полный контроль над контейнером.
RUN mkdir -p /var/lib/investigation/sources && chown -R node:node /var/lib/investigation /app
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -q -O- http://127.0.0.1:8080/healthz || exit 1

CMD ["node", "src/investigation/server/index.js"]
