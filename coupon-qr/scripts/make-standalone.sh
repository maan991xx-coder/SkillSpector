#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# ينسخ موقع الكوبونات إلى مجلد مستقل جاهز ليكون مستودع GitHub خاصاً به،
# فتكتشفه منصات الاستضافة تلقائياً بلا ضبط "مجلد الجذر".
#
# Lifts the coupon site into its own directory, ready to become a standalone
# GitHub repository that Render / Railway / Fly detect without a root-dir setting.
#
#   bash scripts/make-standalone.sh ~/moshrefoon-coupons
# ---------------------------------------------------------------------------
set -euo pipefail

TARGET="${1:-../moshrefoon-coupons}"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -e "$TARGET" ] && [ -n "$(ls -A "$TARGET" 2>/dev/null)" ]; then
  echo "المجلد $TARGET موجود وغير فارغ — اختر مساراً آخر." >&2
  exit 1
fi

mkdir -p "$TARGET"
TARGET="$(cd "$TARGET" && pwd)"
echo "نسخ التطبيق إلى $TARGET"

tar -C "$SOURCE" \
  --exclude=./node_modules --exclude=./data --exclude=./.env \
  --exclude=./scripts/make-standalone.sh \
  -cf - . | tar -C "$TARGET" -xf -

# render.yaml: التطبيق صار في الجذر، فلا حاجة إلى rootDir
python3 - "$TARGET/render.yaml" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1])
text = path.read_text()
text = text.replace("    rootDir: coupon-qr\n", "")
text = text.replace(
    "# نشر بضغطة واحدة على Render — ضع هذا الملف في جذر المستودع\n"
    "# One-click deploy on Render. Blueprints are read from the repository root,\n"
    "# so move this file there (or create the service manually and set\n"
    '# "Root Directory" to coupon-qr).\n',
    "# نشر بضغطة واحدة على Render — Blueprint جاهز في جذر المستودع\n"
    "# One-click deploy on Render: this blueprint sits at the repository root.\n")
path.write_text(text)
PY

# فحص الاختبارات على كل دفعة
mkdir -p "$TARGET/.github/workflows"
cat > "$TARGET/.github/workflows/ci.yml" <<'YML'
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npm test
YML

cd "$TARGET"
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo 'Coupon site')}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo 'noreply@example.com')}" \
    commit -q -m "نظام كوبونات المشرفون — توليد QR وكشفه"

cat <<EOF

تم. الخطوات المتبقية:

  1. أنشئ مستودعاً فارغاً على GitHub باسم moshrefoon-coupons (بلا README).
  2. cd $TARGET
  3. git remote add origin https://github.com/<حسابك>/moshrefoon-coupons.git
  4. git push -u origin main

ثم انشره على Render أو Fly أو أي خادم Docker — التفاصيل في README.md
EOF
