FROM node:20-slim

# تثبيت الأدوات المطلوبة
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    unzip \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# تثبيت deno
RUN curl -fsSL https://deno.land/install.sh | sh
ENV DENO_INSTALL="/root/.deno"
ENV PATH="${DENO_INSTALL}/bin:${PATH}"

# مجلد العمل
WORKDIR /app

# نسخ ملفات المشروع
COPY package*.json ./
RUN npm ci --production

COPY . .

# إنشاء المجلدات مع صلاحيات كاملة
RUN mkdir -p /app/tmp /app/output /app/uploads && \
    chmod -R 777 /app/tmp /app/output /app/uploads

# المنفذ
EXPOSE 8080

# تشغيل التطبيق
CMD ["node", "server.js"]