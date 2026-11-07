#!/usr/bin/env bash
# deploy.sh — развертывание Express + PostgreSQL на Debian с нуля.
# Лежит в корне репозитория рядом с package.json.
#
# Использование:
#   sudo bash deploy.sh <домен>
# Пример:
#   sudo bash deploy.sh todo.example.com
#
# Требования перед запуском:
#   - A-запись домена уже указывает на IP этого сервера
#   - .env создан в корне проекта (по образцу .env.example)
#
# Скрипт идемпотентен: повторный запуск не ломает уже настроенное.

set -euo pipefail

# ── Аргументы ────────────────────────────────────────────────
DOMAIN="${1:?Укажите домен: sudo bash deploy.sh <домен>}"

# ── Пути: корень проекта = директория скрипта ────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Константы ────────────────────────────────────────────────
APP_USER="deploy"
APP_PORT="3000"
NODE_MAJOR="20"
NGINX_SITE="todo"

# ── Проверки перед стартом ───────────────────────────────────
if [ "$(id -u)" -ne 0 ]; then
  echo "ОШИБКА: скрипт нужно запускать от root (sudo)."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo "ОШИБКА: package.json не найден в $PROJECT_DIR."
  echo "Скрипт должен лежать в корне проекта."
  exit 1
fi

if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "ОШИБКА: $PROJECT_DIR/.env не найден."
  echo "Создайте его по образцу .env.example и заполните:"
  echo "  DATABASE_URL, API_TOKEN, OWNER_LOGIN, OWNER_FULLNAME"
  exit 1
fi

echo "===> Проект: $PROJECT_DIR"
echo "===> Домен:  $DOMAIN"

# ── 1. Системные пакеты ──────────────────────────────────────
echo "===> 1. Обновление системы и установка пакетов"
apt update && apt upgrade -y
apt install -y curl git nginx ufw postgresql-client certbot python3-certbot-nginx

# ── 2. Пользователь приложения ───────────────────────────────
echo "===> 2. Пользователь $APP_USER"
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

# ── 3. Node.js ───────────────────────────────────────────────
echo "===> 3. Node.js ${NODE_MAJOR}.x"
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt install -y nodejs
fi
node -v

# ── 4. PM2 ───────────────────────────────────────────────────
echo "===> 4. PM2"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# ── 5. Права и зависимости ───────────────────────────────────
echo "===> 5. Зависимости"
chown -R "$APP_USER:$APP_USER" "$PROJECT_DIR"
sudo -u "$APP_USER" bash -c "cd '$PROJECT_DIR' && npm ci --omit=dev"

# ── 6. Схема БД ──────────────────────────────────────────────
echo "===> 6. Схема БД"
if [ -f "$PROJECT_DIR/sql/schema.sql" ]; then
  DB_URL=$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "$DB_URL" ]; then
    sudo -u "$APP_USER" psql "$DB_URL" -f "$PROJECT_DIR/sql/schema.sql" || true
  else
    echo "  DATABASE_URL не найден в .env — пропускаю применение схемы."
  fi
else
  echo "  sql/schema.sql отсутствует — пропускаю."
fi

# ── 7. PM2 запуск ────────────────────────────────────────────
echo "===> 7. Запуск приложения через PM2"
if sudo -u "$APP_USER" pm2 describe todo &>/dev/null; then
  sudo -u "$APP_USER" pm2 restart todo
else
  sudo -u "$APP_USER" pm2 start src/index.js --name todo --cwd "$PROJECT_DIR"
fi
sudo -u "$APP_USER" pm2 save

PM2_STARTUP_CMD=$(env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | grep '^sudo' || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi

# ── 8. Nginx ─────────────────────────────────────────────────
echo "===> 8. Nginx reverse proxy"
cat > "/etc/nginx/sites-available/$NGINX_SITE" <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

ln -sf "/etc/nginx/sites-available/$NGINX_SITE" "/etc/nginx/sites-enabled/$NGINX_SITE"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 9. Файрвол ───────────────────────────────────────────────
echo "===> 9. UFW"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# ── 10. SSL ──────────────────────────────────────────────────
echo "===> 10. SSL Let's Encrypt"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot --nginx -d "$DOMAIN" \
    --non-interactive --agree-tos \
    --register-unsafely-without-email --redirect
else
  echo "  Сертификат для $DOMAIN уже есть — пропускаю выпуск."
  systemctl reload nginx
fi

echo "===> 11. Проверка автопродления"
certbot renew --dry-run

# ── 12. Финальная проверка ───────────────────────────────────
echo "===> 12. Проверка"
echo "-- HTTP /login/:"
curl -s "http://$DOMAIN/login/" || true
echo ""
echo "-- HTTPS /login/:"
curl -s "https://$DOMAIN/login/" || true
echo ""
echo "=== Готово ==="
echo "Приложение: https://$DOMAIN/"
echo "PM2:        sudo -u $APP_USER pm2 status"