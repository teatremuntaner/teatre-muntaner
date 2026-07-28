#!/usr/bin/env bash
# Compila el sitio (pone Node en el PATH). Uso: bash scripts/build.sh
export PATH="/c/Program Files/nodejs:$PATH"
# Ruta sacada del propio script. Antes estaba clavada a .../teatro-sofia (copiada
# del otro repo): desde aquí compilaba la web del Sofía sin avisar de nada.
cd "$(dirname "$0")/.." || exit 1
npm run build
