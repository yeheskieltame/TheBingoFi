#!/usr/bin/env bash
# Export ABI kontrak TheBingoFi ke contracts/abi/<Name>.json (array ABI murni,
# bukan artifact penuh) supaya langsung bisa di-import FE (wagmi/viem) & server.
#
# Usage: ./export-abi.sh   (jalankan dari dalam folder contracts/)
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

CONTRACTS=(SkillRegistry SkillFactory SkillCollection Marketplace)
OUT_DIR="abi"

mkdir -p "$OUT_DIR"

echo "Building contracts sebelum export ABI..."
forge build

for name in "${CONTRACTS[@]}"; do
  out_file="$OUT_DIR/$name.json"
  echo "Exporting ABI: $name -> $out_file"
  forge inspect "$name" abi --json > "$out_file"
done

echo "Selesai. ABI tersedia di $OUT_DIR/"
