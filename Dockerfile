FROM mcr.microsoft.com/playwright:v1.61.1-noble

USER root
COPY fontconfig/local.conf /etc/fonts/local.conf
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        locales \
        fonts-noto-cjk \
    && sed -i '/ja_JP.UTF-8/s/^# //g' /etc/locale.gen \
    && locale-gen ja_JP.UTF-8 \
    && fc-cache -fv \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown pwuser:pwuser /app

ENV LANG=ja_JP.UTF-8
ENV LANGUAGE=ja_JP:ja
ENV LC_ALL=ja_JP.UTF-8

USER pwuser
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY bin ./bin
COPY lib ./lib
COPY default.css ./default.css

ENV APP_ROOT=/app
ENV WORK_ROOT=/work
ENV DEFAULT_CSS_PATH=/app/default.css
ENV PATH="/app/node_modules/.bin:${PATH}"

ENTRYPOINT ["node", "/app/bin/md-pdf.js"]
