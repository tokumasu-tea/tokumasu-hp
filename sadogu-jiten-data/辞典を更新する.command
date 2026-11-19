#!/bin/zsh
# ダブルクリックすると、データファイルから「茶道 実用辞典」のページを作り直します。
cd "$(dirname "$0")/.." || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node scripts/build-sadogu-jiten.mjs
echo ""
echo "このウィンドウは閉じてかまいません。"
read -k 1 "?何かキーを押すと閉じます…"
