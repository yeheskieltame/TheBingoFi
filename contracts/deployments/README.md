# Deployments

File `<chainId>.json` ditulis OTOMATIS oleh `forge script script/Deploy.s.sol --broadcast` (berisi address 4 kontrak + treasury). FE dan server membaca address dari sini.

- `91342.json` → GIWA Sepolia (commit file ini setelah deploy).
- `31337.json` → anvil lokal (artefak test, di-gitignore, jangan di-commit).
