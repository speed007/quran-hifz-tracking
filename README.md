# Quran Hifz Tracker

A self-hosted tracker for Quran memorisation (hifz). Students log revision and
new pages; a scheduler announces daily revision reminders over Telegram and
over MQTT (so a Home Assistant automation can announce them on Alexa).

The stack:

- **Backend**: FastAPI + SQLAlchemy (SQLite) in `backend/`.
- **Frontend**: React + Vite in `frontend/`, built and served by FastAPI.
- **Android app**: Expo / React Native in `mobile/` (see
  [`mobile/README.md`](mobile/README.md)).
- **Deployment**: a single Docker container (built by `backend/Dockerfile`)
  plus a `cloudflared` tunnel container for remote access.

## Prerequisites

- [Docker](https://docs.docker.com/engine/install/) with the Compose plugin
  (Docker Desktop on macOS/Windows includes it; on Linux install the
  `docker-compose-plugin` package).
- An MQTT broker (e.g. Mosquitto) if you want the Alexa/Home Assistant
  announcement. Optional.
- A Cloudflare tunnel token if you want remote access. Optional.

## Quick start

1. Copy the environment template and edit the values:

   ```sh
   cp .env-example .env
   ```

   At minimum set `HIFZ_SECRET_KEY` and, if you want Telegram, the bot token.

2. Start the stack:

   ```sh
   docker compose up -d --build
   ```

   The app is then available at <http://localhost:5101>.

3. Check everything is healthy:

   ```sh
   curl http://localhost:5101/api/health
   # {"status":"ok","app":"Quran Hifz Tracker"}
   docker compose ps
   ```

4. Log in with the default admin account (see "Default admin password" below).

The SQLite database persists in `./data` (mounted at `/app/data` in the
container); it survives `down`/`up` and rebuilds.

### Useful commands

```sh
docker compose logs -f app          # follow app logs
docker compose logs -f cloudflared  # follow tunnel logs
docker compose down                 # stop (data is kept in ./data)
docker compose restart app
```

## Environment variables

Copy `.env-example` to `.env` and adjust. All app settings are prefixed with
`HIFZ_` (see `backend/app/config.py`); the Cloudflare token is
`CLOUDFLARED_TOKEN`. The database URL is overridden in `docker-compose.yml`
to `sqlite:////app/data/hifz.db` so the database lives on the `./data`
volume.

## Placeholders to replace

The repo ships with placeholder values only — no real IPs or credentials are
committed. Before going live, replace every placeholder below with your own
values (in `.env` and wherever else the placeholder appears). **Never commit
real credentials or addresses.**

| Placeholder | Where | Replace with |
| --- | --- | --- |
| `your-mqtt-broker-host` | `.env` (`HIFZ_MQTT_HOST`), `docs/home-assistant.md` | Your MQTT broker host/IP |
| `your-mqtt-username` | `.env` (`HIFZ_MQTT_USER`), `docs/home-assistant.md` | Your MQTT broker username |
| `your-mqtt-password` | `.env` (`HIFZ_MQTT_PASS`), `docs/home-assistant.md` | Your MQTT broker password |
| `media_player.your_echo_device_1..3` | `docs/home-assistant.md`, `README.md` | Your Echo speaker entity IDs (the ones your existing automation uses) |
| `change-me-to-a-long-random-string` | `.env` (`HIFZ_SECRET_KEY`) | A long random secret |
| `your-telegram-bot-token` (if used) | `.env` (`HIFZ_TELEGRAM_BOT_TOKEN`) | Your @BotFather token |
| `admin` password | `.env` (`HIFZ_DEFAULT_ADMIN_PASSWORD`) | A strong admin password |

MQTT is disabled unless `HIFZ_MQTT_HOST` is set, so the app will not try to
connect anywhere until you configure your broker.

## Telegram daily summary

1. Talk to [@BotFather](https://t.me/BotFather) on Telegram and send
   `/newbot`. Follow the prompts, pick a name (e.g. "Hifz Reminder") and a
   username. BotFather returns an HTTP API token that looks like
   `123456789:AA...`.

2. Put the token in `.env` as `HIFZ_TELEGRAM_BOT_TOKEN` and restart:

   ```sh
   docker compose up -d app
   ```

3. Link each user (so the bot knows which Telegram `chat_id` to send to).
   In the app UI, create a user and link their Telegram account with the
   bot's `/link` command:

   ```
   Send /start to your bot, then /link to get a code, and enter that code in
   the app's settings/Users page.
   ```

4. Set the daily summary time with `HIFZ_TELEGRAM_DAILY_TIME` (24h clock,
   e.g. `18:00`). The scheduler fires on the minute in
   `HIFZ_TIMEZONE` (default `Europe/London`).

## Alexa / Home Assistant announcement

The app does not talk to Alexa directly. Instead it publishes MQTT messages
per student that a Home Assistant automation turns into spoken announcements:

- **Revision reminders** (fixed times from Settings):
  topic `hifz/revision/<student>`, payload
  `{"message": "Amina, it's time for revision. Please revise pages 5 to 8."}`
- **Schedule reminders** (before each timetable slot, per-student lead time):
  topic `hifz/schedule/<student>/remind`, payload
  `{"message": "Amina, Memorisation starts at 5:00pm."}`
- **Schedule state** (pushed whenever a timetable changes):
  topic `hifz/schedule/<student>/state`, payload
  `{"student": "amina", "slots": [...]}`

A Home Assistant automation listens on those topics and forwards the message
to an Alexa device via the `alexa_media` integration. Example (same
`notify.alexa_media` pattern as any existing announcement you may already run):

```yaml
automation:
  - alias: "Announce hifz revision"
    trigger:
      - platform: mqtt
        topic: "hifz/revision/+"
    action:
      - data:
          data:
            type: tts
            method: all
          target:
            - media_player.your_echo_device_1
            - media_player.your_echo_device_2
            - media_player.your_echo_device_3
          message: "{{ trigger.payload_json.message }}"
        action: notify.alexa_media
```

Full step-by-step setup (MQTT integration, Alexa Media Player, ready-to-paste
automations for both topics) is in
[`docs/home-assistant.md`](docs/home-assistant.md).

Notes:

- MQTT settings live in `.env` (`HIFZ_MQTT_HOST`, `HIFZ_MQTT_PORT`,
  `HIFZ_MQTT_USER`, `HIFZ_MQTT_PASS`) — replace the placeholders with your
  broker details. Leave `HIFZ_MQTT_HOST` empty to disable MQTT.
- Schedule reminders are configured per student in the app's **Settings**
  page: pick a student, enable "Announce schedule reminders", set the lead
  minutes, and use "Send test announcement" to verify the pipe.
- Schedule: `HIFZ_ALEXA_ENABLED`, `HIFZ_ALEXA_WEEKDAY_TIME` (default
  `16:00`) and `HIFZ_ALEXA_WEEKEND_TIME` (default `11:00`).
- The exact wording is generated by the app (see
  `backend/app/services/revision.py` and `backend/app/services/reminders.py`)
  and uses UK-English voice copy.

## UK-English voice copy examples

The announcement text is written for UK-English text-to-speech:

- `"Amina, it's time for revision. Please revise pages 5 to 8."`
- `"Yusuf, it's time for revision. Please revise page 12."`

If you want to tweak the copy, edit `build_revision_message()` in
`backend/app/services/revision.py` and rebuild the image
(`docker compose up -d --build app`).

## Default admin password

On a fresh database the seed creates the admin account from
`HIFZ_DEFAULT_ADMIN_USERNAME` (default `admin`) and
`HIFZ_DEFAULT_ADMIN_PASSWORD` (default `admin`).

**You should change it as soon as possible.** After first login:

1. Go to **Settings** in the UI and change the password, or
2. change `HIFZ_DEFAULT_ADMIN_USERNAME` / `HIFZ_DEFAULT_ADMIN_PASSWORD` in
   `.env`, then remove `./data/hifz.db` and restart to re-seed on a fresh
   database:

   ```sh
   docker compose down
   rm ./data/hifz.db*
   docker compose up -d --build
   ```

## Remote access (Cloudflare tunnel)

Create a tunnel in the Cloudflare Zero Trust dashboard and copy its token
into `.env`:

```
CLOUDFLARED_TOKEN=eyJh... (long token)
```

Then:

```sh
docker compose up -d cloudflared
```

The `cloudflared` container runs `tunnel --no-autoupdate run --token ...` and
exposes the app's public URL, proxying to the `app` service on port 5101.

## Run on Debian / Debian-based without Docker

This guide covers running the app directly on a Debian (or Ubuntu / Debian LXC
container) server, without Docker. Two modes are described:

- **Dev mode** — hot-reloading backend (`uvicorn --reload`) and a Vite dev
  server for the frontend.
- **Single-service mode (recommended for a server)** — build the frontend once
  and let the backend serve it, so only one process runs. This is what the
  Docker image does internally.

All commands assume you are `root` or using `sudo`.

### 1. Install system packages

```sh
apt update
apt install -y git curl ca-certificates build-essential python3 python3-venv python3-dev
```

Python 3.11+ is required. On Debian 12 / Ubuntu 24.04 the default `python3` is
already 3.11+. Check with `python3 --version`.

### 2. Install `uv` (fast Python package manager)

```sh
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc          # or ~/.profile, to put uv on PATH
uv --version
```

### 3. Install Node.js and pnpm (for the frontend build)

```sh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable          # ships with Node; installs pnpm via Corepack
pnpm --version
```

If `corepack` is unavailable, fall back to `npm install -g pnpm`.

### 4. Get the code and create the environment

```sh
git clone git@github.com:speed007/quran-hifz-tracking.git
cd quran-hifz-tracking

# Backend environment
uv venv .venv
source .venv/bin/activate
uv pip install -r backend/requirements.txt

# Frontend dependencies
cd frontend && pnpm install && cd ..
```

### 5. Configure `.env`

```sh
cp .env-example .env
```

Edit `.env` and set (see "Placeholders to replace" above):

- `HIFZ_SECRET_KEY` — a long random string.
- `HIFZ_DATABASE_URL` — e.g. `sqlite:////opt/quran-hifz/data/hifz.db` so the
  database lives outside the repo. Create that directory:
  `mkdir -p /opt/quran-hifz/data`.
- `HIFZ_MQTT_HOST`, `HIFZ_MQTT_USER`, `HIFZ_MQTT_PASS` — your MQTT broker
  details (or leave host empty to disable).
- `HIFZ_DEFAULT_ADMIN_PASSWORD` — a strong admin password for first login.

The app reads `.env` from the directory you launch it in (it also honours
real shell env vars, which take precedence).

### 6a. Dev mode (two terminals)

Terminal 1 — backend with auto-reload on port 5101:

```sh
cd quran-hifz-tracking
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 5101 --app-dir backend --reload
```

Terminal 2 — Vite dev server (proxies `/api` to `:5101`):

```sh
cd quran-hifz-tracking/frontend
pnpm dev
```

Open the Vite URL (usually `http://<server>:5173`).

### 6b. Single-service mode (recommended)

Build the frontend once (outputs to `frontend/dist`, served by the backend):

```sh
cd quran-hifz-tracking/frontend
pnpm build
cd ..
```

Then run the backend — it serves the built UI at `http://<server>:5101`:

```sh
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 5101 --app-dir backend
```

Verify: `curl http://localhost:5101/api/health`.

### 7. Run as a systemd service (auto-start on boot)

Create `/etc/systemd/system/hifz.service`:

```ini
[Unit]
Description=Quran Hifz Tracker
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/quran-hifz
EnvironmentFile=/opt/quran-hifz/.env
ExecStart=/opt/quran-hifz/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 5101 --app-dir backend
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```sh
mkdir -p /opt/quran-hifz/data
chown -R www-data:www-data /opt/quran-hifz
systemctl daemon-reload
systemctl enable --now hifz
systemctl status hifz
```

Useful commands:

```sh
journalctl -u hifz -f      # follow app logs
systemctl restart hifz     # restart after an update
```

### 8. Optional — Cloudflare tunnel (remote access)

Install `cloudflared` (see cloudflare.com docs) and run the tunnel pointing at
`localhost:5101`:

```sh
cloudflared tunnel --url http://localhost:5101     # quick tunnel (URL printed)
# or, for a named tunnel:
cloudflared tunnel run --token <CLOUDFLARED_TOKEN>
```

Put the token in `.env` as `CLOUDFLARED_TOKEN` (used by the systemd unit via
`EnvironmentFile`).

### Updating after a new release

```sh
cd quran-hifz-tracking
git pull
cd frontend && pnpm install && pnpm build && cd ..
source .venv/bin/activate && uv pip install -r backend/requirements.txt
systemctl restart hifz   # or just re-run uvicorn if not using systemd
```

The database is kept in `/opt/quran-hifz/data/hifz.db` and survives updates;
new columns are added automatically on startup (`migrate_db`).
