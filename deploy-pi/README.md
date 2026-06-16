# Raspberry Pi kiosk deployment

Two self-healing Docker containers + a kiosk browser. RAG stays on Render.

```
┌──────────── Raspberry Pi ────────────┐
│  Chromium --kiosk  →  http://localhost│
│        │                              │
│   ┌────▼─── web (nginx) ────┐         │
│   │  serves dist/           │         │
│   │  /api/* ─► api:3001 ─────┼──┐      │
│   └─────────────────────────┘  │      │
│   ┌──────── api (node) ◄───────┘      │
│   │  Gemini · Supabase · RAG │        │
│   └────────────┬─────────────┘        │
└────────────────┼──────────────────────┘
                 ▼  (internet)
        Render RAG · Gemini · Supabase
```

## Why this shape
- **`web` (nginx)** serves the static build and reverse-proxies `/api/*` to `api` — fast static serving, one TLS/entry point.
- **`api` (node)** runs the exact same `api/*` handlers as Vercel (via `scripts/api-server.ts`). Keeps all secrets server-side.
- **`restart: unless-stopped`** + Docker's systemd unit ⇒ both containers come back on crash and on reboot.
- The **browser is not containerised** — it needs the Pi's display/GPU.

## One-time Pi setup
1. Install Docker + Compose plugin, and enable Docker on boot:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker pi
   sudo systemctl enable docker
   ```
2. Enable **Desktop Autologin**: `sudo raspi-config` → System Options → Boot / Auto Login → Desktop Autologin.
3. Clone the repo to `/home/pi/barcelona-civic-vision`.

## Configure + run the containers
```bash
cd /home/pi/barcelona-civic-vision/deploy-pi
cp .env.example .env      # fill in keys (see file)
docker compose up -d --build
```
Check: `curl http://localhost/health` → `{"ok":true}`.

> Rebuild the **web** image after changing any `VITE_*` value — they're baked in at build time.

## Auto-start the kiosk browser
```bash
chmod +x /home/pi/barcelona-civic-vision/deploy-pi/start-kiosk.sh
sudo cp /home/pi/barcelona-civic-vision/deploy-pi/kiosk.service /etc/systemd/system/
sudo systemctl enable kiosk.service
sudo reboot
```
On boot: Docker starts → compose brings up `web`+`api` → `kiosk.service` waits for `http://localhost/health` → Chromium opens full-screen.

## Notes / caveats
- **Internet is required** — Gemini, Supabase, and Groq (via Render) are all cloud. Offline, the page loads but generation/browse fail.
- **Pi hardware**: Pi 4/5 with 4GB+ (8GB ideal) and active cooling for sustained kiosk use.
- **Bookworm/Wayland**: the chromium binary is `chromium` (handled by `start-kiosk.sh`). If the Pi uses Wayland (labwc), `xset`/`DISPLAY=:0` may not apply — switch to X11 in `raspi-config` → Advanced → Wayland, or adapt the service.
- **Updating**: `git pull && docker compose up -d --build` in `deploy-pi/`.
- **Logs**: `docker compose logs -f api` / `... web`; kiosk: `journalctl -u kiosk.service -f`.
