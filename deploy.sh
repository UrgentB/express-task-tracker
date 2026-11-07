#!/usr/bin/env bash
# deploy-todo.sh — полное развертывание Express + PostgreSQL на Debian с нуля
# Запускать от root на свежем VPS.
# Использование: bash deploy-todo.sh <домен> <git-репозиторий> <путь-к-проекту>
# Пример: bash deploy-todo.sh todo.example.com https://github.com/UrgentB/express-task-tracker.git /home/deploy/express-task-tracker

set -euo pipefail

DOMAIN="${1:?Укажите домен}"
REPO_URL="${2:?Укажите Git-репозиторий}"
PROJECT_DIR="${3:?Укажите путь к проекту}"
APP_USER="deploy"
APP_PORT="3000"
NODE_MAJOR="20"

echo "===> 1. Обновление системы и базовые пакеты"
apt update && apt upgrade -y
apt install -y curl git nginx ufw postgresql-client

echo "===> 2. Создание пользователя приложения (если не существует)"
if ! id "$APP_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$APP_USER"
  usermod -aG sudo "$APP_USER"
fi

echo "===> 3. Установка Node.js ${NODE_MAJOR}.x через NodeSource"
curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
apt install -y nodejs

echo "===> 4. Установка PM2"
npm install -g pm2

echo "===> 5. Клонирование репозитория и установка зависимостей"
mkdir -p "$(dirname "$PROJECT_DIR")"
if [ ! -d "$PROJECT_DIR/.git" ]; then
  sudo -u "$APP_USER" git clone "$REPO_URL" "$PROJECT_DIR"
else
  sudo -u "$APP_USER" git -C "$PROJECT_DIR" pull
fi

cd "$PROJECT_DIR"
sudo -u "$APP_USER" npm ci --omit=dev

echo "===> 6. Проверка наличия .env"
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo "ОШИБКА: $PROJECT_DIR/.env не найден."
  echo "Создайте его вручную по образцу .env.example и заполните DATABASE_URL, API_TOKEN, OWNER_LOGIN, OWNER_FULLNAME."
  echo "После этого запустите скрипт снова."
  exit 1
fi

echo "===> 7. Применение схемы БД (если есть sql/schema.sql)"
if [ -f "$PROJECT_DIR/sql/schema.sql" ]; then
  # Извлекаем DATABASE_URL из .env
  DB_URL=$(grep -E '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  if [ -n "$DB_URL" ]; then
    sudo -u "$APP_USER" psql "$DB_URL" -f "$PROJECT_DIR/sql/schema.sql" || true
  fi
fi

echo "===> 8. Запуск приложения через PM2 (от имени $APP_USER)"
sudo -u "$APP_USER" pm2 start src/index.js --name todo --cwd "$PROJECT_DIR"
sudo -u "$APP_USER" pm2 save
# Настраиваем автозапуск PM2 при загрузке
env PATH="$PATH" pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | tail -1 | bash || true

echo "===> 9. Настройка Nginx как reverse proxy"
cat > /etc/nginx/sites-available/todo <<NGINX
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

ln -sf /etc/nginx/sites-available/todo /etc/nginx/sites-enabled/todo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "===> 10. Настройка файрвола UFW"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "===> 11. Выпуск SSL-сертификата Let's Encrypt"
apt install -y certbot python3-certbot-nginx
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email --redirect

echo "===> 12. Проверка автопродления сертификата"
certbot renew --dry-run

echo "===> 13. Финальная проверка"
echo "HTTP /login/:"
curl -s "http://$DOMAIN/login/" || true
echo ""
echo "HTTPS /login/:"
curl -s "https://$DOMAIN/login/" || true
echo ""
echo "=== Развертывание завершено ==="
echo "Приложение доступно по адресу: https://$DOMAIN/"
echo "PM2 статус: sudo -u $APP_USER pm2 status"