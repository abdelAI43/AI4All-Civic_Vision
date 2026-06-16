#!/usr/bin/env bash
# Launches the kiosk browser once the web app answers. Used by kiosk.service.
set -u

URL="http://localhost"

# Wait until nginx is serving (containers may still be starting on boot).
until wget -qO- "$URL/health" >/dev/null 2>&1; do
  sleep 2
done

# Disable screen blanking / power management (X11; harmless if it fails).
xset s off    2>/dev/null || true
xset -dpms    2>/dev/null || true
xset s noblank 2>/dev/null || true

# Chromium binary is "chromium-browser" on older Pi OS, "chromium" on Bookworm.
BROWSER="$(command -v chromium-browser || command -v chromium)"

exec "$BROWSER" \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-features=Translate \
  --check-for-update-interval=31536000 \
  --autoplay-policy=no-user-gesture-required \
  --use-fake-ui-for-media-stream \
  "$URL"
