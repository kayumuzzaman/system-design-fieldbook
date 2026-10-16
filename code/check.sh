#!/bin/sh
# check.sh        type-check every listing strictly, then run every chapter's tests with plain node
# check.sh 60     the same, but run only the tests of chapter 60
set -e
cd "$(dirname "$0")"
npx tsc -p .
echo "types ok"
for f in ${1:-[0-9][0-9]}-*/test*.ts; do echo "== node $f"; node "$f"; done
