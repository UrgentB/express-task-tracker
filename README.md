# Список дел: Express + PostgreSQL

Итоговое практическое задание на 24.10.2026. Индивидуальная работа.

## ФИО и логин

```
Логин Moodle: urgentb
ФИО:          Добродум Александр Вадимович
```

## Обоснование выбора площадки

Выбрана **Timeweb Cloud** (VPS с Debian + облачный PostgreSQL).

**Причины выбора:**

```
- Гибкость стека: полноценный VPS с root-доступом позволяет запустить
  Node.js, Nginx и клиентскую статику на одном сервере.
- Подённая оплата: постоянного бесплатного тарифа нет,
  но подённый биллинг удобен для сдачи —
  можно поднять сервер на время проверки и удалить после.
- Отечественный сервис: соответствует требованию задания о сравнении
  хотя бы одного российского провайдера.
```

**Ограничения:**

```
Бесплатный тариф отсутствует, оплата начинается с первого часа.
Минимальная конфигурация VPS — от ~350–900 ₽/мес в зависимости от срока оплаты.
Managed PostgreSQL — от 790 ₽/мес.
```

**Проверка доступности:**

```
Выполнена 31.10.2026. Сервер и БД активны, подключение по TLS работает.
Официальный источник: timeweb.cloud (тарифы и документация).
Дата проверки: 31.10.2026.
```

## Сравнение трёх вариантов размещения

| Вариант | СУБД | Бесплатный тариф | Ограничения | Результат проверки |
|---|---|---|---|---|
| **Timeweb Cloud** (выбран) | PostgreSQL 18 managed | Нет. Почасовой биллинг, от 50 ₽ | VPS от 350 ₽/мес; DBaaS от 790 ₽/мес | Доступен, развёрнут |
| **Supabase** | PostgreSQL | Да (Free Plan) | 500 MB БД, пауза после 7 дней неактивности, 2 активных проекта | Не проверялся (не выбран) |
| **MongoDB Atlas** | MongoDB | Да (M0) | 512 MB хранилище, 100 записей/сек, без настройки памяти | Не проверялся (не выбран) |
| **Helios (ВМК)** | PostgreSQL (учебный) | Для учебных заданий | Доступ по расписанию практикума; внешний доступ не гарантирован | Доступ не получен, внешнее подключение не подтверждено |

Также рассматривался университетский Helios. Не был выбран из-за опасения столкновения с техническими ограничениями и желания ознакомится с более профессиональными вариантами.

**Обоснование выбора Timeweb:**

```
Задание требует работающий HTTPS-адрес и независимый доступ проверяющего к БД.
Supabase Free даёт PostgreSQL, но проект засыпает через неделю неактивности —
риск для сдачи. Atlas M0 — MongoDB, а не PostgreSQL. Helios не гарантирует
внешний доступ и не подходит для постоянного HTTPS-хостинга приложения.
```

## Структура приложения

```
todo-express/
├── package.json
├── package-lock.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── index.js          # Express app, статика, роуты
│   ├── db.js             # pg Pool
│   ├── auth.js           # Bearer token middleware
│   ├── validate.js       # title, runId, UUID
│   └── routes/
│       ├── login.js      # GET /login/
│       ├── author.js     # GET /api/author/
│       └── tasks.js      # CRUD /api/tasks/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
└── sql/
    └── schema.sql
```

## Схема данных и сопоставление полей

Таблица `tasks`:

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_login TEXT NOT NULL,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  run_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

| API поле | Столбец БД | Тип | Примечание |
|---|---|---|---|
| `id` | `id` | UUID | Генерируется сервером |
| `ownerLogin` | `owner_login` | TEXT | Из конфигурации, не из тела запроса |
| `title` | `title` | TEXT | Trim, 1–200 символов |
| `done` | `done` | BOOLEAN | Начальное значение `false` |
| `runId` | `run_id` | TEXT | 1–64 символа: `A-Za-z0-9_-` |
| `createdAt` | `created_at` | TIMESTAMPTZ | Отдаётся как ISO 8601 UTC |

Внутренний ключ БД — `id` (UUID), он же используется в API.

## Версии

```
Node.js:    20.x LTS
PostgreSQL: 18 (Timeweb managed)
Express:    4.21
pg:         8.13
```

## Установка и запуск

```bash
# 1. Клонировать репозиторий
git clone https://github.com/UrgentB/express-task-tracker.git
cd todo-express

# 2. Установить зависимости
npm ci

# 3. Создать .env из шаблона
cp .env.example .env
# Заполнить DATABASE_URL, API_TOKEN, OWNER_LOGIN, OWNER_FULLNAME

# 4. Применить схему БД (один раз)
psql "$DATABASE_URL" -f sql/schema.sql

# 5. Запустить
npm start
```

Приложение слушает `PORT` (по умолчанию 3000). Статика доступна на `/`, API — на `/api/`.

## Команды развёртывания на Debian (Timeweb VPS)

```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs postgresql-client nginx

# Клонирование и установка
git clone https://github.com/<urgentb>/todo-express.git /opt/todo
cd /opt/todo
npm ci

# .env
cp .env.example .env
nano .env

# Схема БД
psql "$DATABASE_URL" -f sql/schema.sql

# pm2
sudo npm i -g pm2
pm2 start src/index.js --name todo
pm2 save
pm2 startup

# Nginx reverse proxy + HTTPS (Certbot)
sudo apt install -y certbot python3-certbot-nginx
# настроить server block на порт 3000, затем:
sudo certbot --nginx -d ваш-домен.timeweb.cloud
```

## Ручное дело для проверки

После первого запуска создано дело с `runId = "manual"` и заголовком: 

```
Итоговая работа 24.10.2026: urgentb
```

## Доступ для проверяющего

```
HTTPS-адрес:  https://dobrodum35.ru
Токен API:    передан личным сообщением
Доступ к БД:  передан личным сообщением
```

Пароль от Moodle, ИСУ и основного аккаунта Timeweb не передаётся.
