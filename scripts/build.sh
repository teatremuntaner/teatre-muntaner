#!/usr/bin/env bash
# Compila el sitio (pone Node en el PATH). Uso: bash scripts/build.sh
export PATH="/c/Program Files/nodejs:$PATH"
cd "C:/Users/carlo/dev/teatro-sofia" || exit 1
npm run build
