#!/bin/bash

# Test Report Export Endpoints
# Usage: ./test-reports.sh

BASE_URL="http://localhost:3005"
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "=========================================="
echo "  REPORT EXPORT FUNCTIONALITY TEST"
echo "=========================================="
echo ""

# Login first
echo "Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "${RED}❌ Login failed${NC}"
  exit 1
fi

echo -e "${GREEN}✅ Login successful${NC}"
echo ""

# Create reports directory
mkdir -p reports
cd reports

echo "Testing Report Exports..."
echo "----------------------------------------"

# Test 1: Firms Report PDF
echo -n "1. Firms Report (PDF)... "
HTTP_CODE=$(curl -s -o "firms-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/firms/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 2: Firms Report Excel
echo -n "2. Firms Report (Excel)... "
HTTP_CODE=$(curl -s -o "firms-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/firms/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 3: Tenders Report PDF
echo -n "3. Tenders Report (PDF)... "
HTTP_CODE=$(curl -s -o "tenders-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/tenders/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 4: Tenders Report Excel
echo -n "4. Tenders Report (Excel)... "
HTTP_CODE=$(curl -s -o "tenders-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/tenders/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 5: Tender Summary Report PDF (if exists)
echo -n "5. Tender Summary Report (PDF)... "
HTTP_CODE=$(curl -s -o "tender-summary-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/tender-summary/1/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
elif [ "$HTTP_CODE" = "404" ]; then
  echo -e "${BLUE}⚠️  No data (404)${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 6: Projects Report PDF
echo -n "6. Projects Report (PDF)... "
HTTP_CODE=$(curl -s -o "projects-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/projects/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 7: Projects Report Excel
echo -n "7. Projects Report (Excel)... "
HTTP_CODE=$(curl -s -o "projects-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/projects/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 8: Financial Report PDF
echo -n "8. Financial Report (PDF)... "
HTTP_CODE=$(curl -s -o "financial-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/financial/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 9: Financial Report Excel
echo -n "9. Financial Report (Excel)... "
HTTP_CODE=$(curl -s -o "financial-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/financial/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 10: Expenses Report PDF
echo -n "10. Expenses Report (PDF)... "
HTTP_CODE=$(curl -s -o "expenses-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/expenses/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 11: Expenses Report Excel
echo -n "11. Expenses Report (Excel)... "
HTTP_CODE=$(curl -s -o "expenses-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/expenses/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 12: Team Report PDF
echo -n "12. Team Report (PDF)... "
HTTP_CODE=$(curl -s -o "team-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/team/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 13: Team Report Excel
echo -n "13. Team Report (Excel)... "
HTTP_CODE=$(curl -s -o "team-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/team/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 14: Contacts Report PDF
echo -n "14. Contacts Report (PDF)... "
HTTP_CODE=$(curl -s -o "contacts-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/contacts/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 15: Contacts Report Excel
echo -n "15. Contacts Report (Excel)... "
HTTP_CODE=$(curl -s -o "contacts-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/contacts/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 16: Licenses Report PDF
echo -n "16. Licenses Report (PDF)... "
HTTP_CODE=$(curl -s -o "licenses-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/licenses/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 17: Licenses Report Excel
echo -n "17. Licenses Report (Excel)... "
HTTP_CODE=$(curl -s -o "licenses-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/licenses/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 18: Comprehensive Report PDF (Admin only)
echo -n "18. Comprehensive Report (PDF)... "
HTTP_CODE=$(curl -s -o "comprehensive-report.pdf" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/comprehensive/pdf")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

# Test 19: Comprehensive Report Excel (Admin only)
echo -n "19. Comprehensive Report (Excel)... "
HTTP_CODE=$(curl -s -o "comprehensive-report.xlsx" -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$BASE_URL/api/reports/comprehensive/excel")

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Generated${NC}"
else
  echo -e "${RED}❌ Failed (HTTP $HTTP_CODE)${NC}"
fi

echo ""
echo "=========================================="
echo "  REPORT FILES GENERATED"
echo "=========================================="
echo ""
ls -lh *.pdf *.xlsx 2>/dev/null | awk '{print $9, "-", $5}'
echo ""
echo -e "${BLUE}All report files saved in 'reports' directory${NC}"
