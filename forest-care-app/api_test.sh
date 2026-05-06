#!/usr/bin/env bash
BASE="http://localhost:3001"
sleep 2

REG=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"testfix@test.com","password":"testpass99"}')

TOKEN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"testfix@test.com","password":"testpass99"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
echo "Token: ${TOKEN:0:30}..."

echo ""
echo "--- Cadastre search 145-410-43-16 ---"
curl -s -o /tmp/cad.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/cadastre/search/145-410-43-16"
cat /tmp/cad.json | python3 -m json.tool 2>/dev/null | head -20

echo ""
echo "--- Cadastre at Helsinki (60.175, 24.94) ---"
curl -s -o /tmp/coord.json -w "HTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE/api/cadastre/at?lat=60.175&lng=24.94"
cat /tmp/coord.json | python3 -m json.tool 2>/dev/null | head -20









