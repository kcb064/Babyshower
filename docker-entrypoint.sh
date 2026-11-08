#!/bin/sh
# Make sure /data (database, uploads, backups, image cache) is writable by the app user, then drop
# to that user. Docker creates a bind-mounted host folder as root when it does not exist yet, which
# would otherwise stop the app from writing its database. Running the container with `user:` set
# skips all of this and starts the app directly.
set -eu

DATA_DIR="${DATA_DIR:-/data}"
APP_USER="${APP_USER:-node}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups" "$DATA_DIR/imgcache"
  app_uid="$(id -u "$APP_USER")"
  owner="$app_uid:$(id -g "$APP_USER")"
  # chown recursively only when the folder is not ours yet (first start or a copied-in volume);
  # the image cache can hold many files and should not be walked on every boot.
  if [ "$(stat -c %u "$DATA_DIR")" != "$app_uid" ]; then
    chown -R "$owner" "$DATA_DIR"
  else
    chown "$owner" "$DATA_DIR/uploads" "$DATA_DIR/backups" "$DATA_DIR/imgcache"
  fi
  exec su-exec "$APP_USER" "$@"
fi

exec "$@"
