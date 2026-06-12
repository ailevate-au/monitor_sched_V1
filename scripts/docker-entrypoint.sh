#!/bin/sh
set -e

cd /app

if [ ! -f prisma/dev.db ]; then
  if [ -f prisma/dev.db.template ]; then
    cp prisma/dev.db.template prisma/dev.db
    echo "Initialized prisma/dev.db from image template"
  else
    echo "No database found; run prisma db push && prisma db seed on the host volume"
    exit 1
  fi
fi

exec node dist/server.cjs
