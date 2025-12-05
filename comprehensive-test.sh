#!/bin/bash

# Comprehensive API Test Suite for Big Office
# Tests all major endpoints and functionality

BASE_URL="http://localhost:3005"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  BIG OFFICE COMPREHENSIVE API TEST${NC}"
echo -e "${BOLD}========================================${NC}\n"

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local expected_status="$4"
    local data="$5"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    if [ "$method" = "GET" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE_URL$endpoint")
    elif [ "$method" = "POST" ]; then
        status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    fi
    
    if [ "$status" = "$expected_status" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $name (Status: $status)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo -e "${RED}❌ FAIL${NC}: $name (Expected: $expected_status, Got: $status)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# ============================================
# 1. AUTHENTICATION
# ============================================
echo -e "\n${BOLD}1. AUTHENTICATION & USER MANAGEMENT${NC}"
echo "----------------------------------------"

# Login
echo -n "Logging in... "
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Demo@123456"}')

TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.accessToken')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo -e "${GREEN}✅ Login successful${NC}"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo -e "${RED}❌ Login failed${NC}"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    exit 1
fi
TOTAL_TESTS=$((TOTAL_TESTS + 1))

test_endpoint "Get Users" "GET" "/api/users" "200"
test_endpoint "Get Dashboard Stats" "GET" "/api/dashboard/stats" "200"

# ============================================
# 2. FIRMS MANAGEMENT
# ============================================
echo -e "\n${BOLD}2. FIRMS MANAGEMENT${NC}"
echo "----------------------------------------"

test_endpoint "Get All Firms" "GET" "/api/firms" "200"
test_endpoint "Get Firm Details" "GET" "/api/firms/19" "200"
test_endpoint "Get Firm Dashboard" "GET" "/api/firms/19/dashboard" "200"
test_endpoint "Get Firm Documents" "GET" "/api/firms/19/documents" "200"

# Test creating a firm
NEW_FIRM='{"name":"Test Firm","business_id":"TEST123","category":"Construction","email":"test@firm.com","mobile":"01700000000","address":"Test Address"}'
test_endpoint "Create Firm" "POST" "/api/firms" "200" "$NEW_FIRM"

# ============================================
# 3. LICENSES & REGISTRATIONS
# ============================================
echo -e "\n${BOLD}3. LICENSES & REGISTRATIONS${NC}"
echo "----------------------------------------"

test_endpoint "Get Licenses" "GET" "/api/licenses" "200"
test_endpoint "Get Enlistments" "GET" "/api/enlistments" "200"
test_endpoint "Get Tax Compliance" "GET" "/api/tax-compliance" "200"

# ============================================
# 4. FINANCIAL MANAGEMENT
# ============================================
echo -e "\n${BOLD}4. FINANCIAL MANAGEMENT${NC}"
echo "----------------------------------------"

test_endpoint "Get Bank Accounts" "GET" "/api/bank-accounts" "200"
test_endpoint "Get Pay Orders" "GET" "/api/pay-orders" "200"
test_endpoint "Get Bank Guarantees" "GET" "/api/bank-guarantees" "200"
test_endpoint "Get Loans" "GET" "/api/loans" "200"

# ============================================
# 5. TENDERS & PROJECTS
# ============================================
echo -e "\n${BOLD}5. TENDERS & PROJECTS${NC}"
echo "----------------------------------------"

test_endpoint "Get Tenders" "GET" "/api/tenders" "200"
test_endpoint "Get Projects" "GET" "/api/projects" "200"
test_endpoint "Get Alerts" "GET" "/api/alerts" "200"

# ============================================
# 6. TENDER SUMMARIES (CRITICAL)
# ============================================
echo -e "\n${BOLD}6. TENDER SUMMARIES (Critical Feature)${NC}"
echo "----------------------------------------"

test_endpoint "Get Tender Summaries" "GET" "/api/tender-summaries" "200"

# Test creating tender summary
TENDER_SUMMARY='{
  "egp_tender_id":"TEST123",
  "procuring_entity":"Test Entity",
  "official_inviting_tender":"Test Official",
  "brief_description":"Test tender description",
  "procurement_type":"NCT",
  "procurement_method":"OTM",
  "document_price":500,
  "tender_security_amount":10000,
  "firm_id":19
}'
test_endpoint "Create Tender Summary" "POST" "/api/tender-summaries" "200" "$TENDER_SUMMARY"

# Get items and requirements endpoints
test_endpoint "Get Summary Items" "GET" "/api/tender-summaries/1/items" "200"
test_endpoint "Get Preparation Requirements" "GET" "/api/tender-summaries/1/requirements" "200"

# ============================================
# 7. CONTACTS & OFFICIALS
# ============================================
echo -e "\n${BOLD}7. CONTACTS & OFFICIALS${NC}"
echo "----------------------------------------"

test_endpoint "Get Contacts" "GET" "/api/contacts" "200"

# Test creating contact
CONTACT='{
  "firm_id":19,
  "contact_type":"official",
  "name":"Test Official",
  "designation":"Director",
  "email":"official@test.com",
  "phone":"01700000000",
  "mobile":"01700000001"
}'
test_endpoint "Create Contact" "POST" "/api/contacts" "200" "$CONTACT"

# ============================================
# 8. TEAM & TASKS
# ============================================
echo -e "\n${BOLD}8. TEAM & TASKS MANAGEMENT${NC}"
echo "----------------------------------------"

test_endpoint "Get Team Members" "GET" "/api/team-members" "200"
test_endpoint "Get Tasks" "GET" "/api/tasks" "200"

# ============================================
# 9. SUPPLIERS & CLIENTS
# ============================================
echo -e "\n${BOLD}9. SUPPLIERS & CLIENTS${NC}"
echo "----------------------------------------"

test_endpoint "Get Suppliers" "GET" "/api/suppliers" "200"
test_endpoint "Get Clients" "GET" "/api/clients" "200"

# ============================================
# 10. EXPENSE MANAGEMENT
# ============================================
echo -e "\n${BOLD}10. EXPENSE MANAGEMENT${NC}"
echo "----------------------------------------"

test_endpoint "Get Expense Categories" "GET" "/api/expense-categories" "200"
test_endpoint "Get Expenses" "GET" "/api/expenses" "200"
test_endpoint "Get Expense Stats" "GET" "/api/expenses/stats/summary" "200"

# Test creating expense category with unique name
TIMESTAMP=$(date +%s)
EXPENSE_CAT="{\"name\":\"Test Category $TIMESTAMP\",\"description\":\"Test expense category\"}"
test_endpoint "Create Expense Category" "POST" "/api/expense-categories" "200" "$EXPENSE_CAT"

# ============================================
# 11. LETTER HUB
# ============================================
echo -e "\n${BOLD}11. LETTER HUB${NC}"
echo "----------------------------------------"

test_endpoint "Get Letter Categories" "GET" "/api/letter-categories" "200"
test_endpoint "Get Letter Templates" "GET" "/api/letter-templates" "200"
test_endpoint "Get Generated Letters" "GET" "/api/generated-letters" "200"

# ============================================
# 12. DOCUMENT MANAGEMENT
# ============================================
echo -e "\n${BOLD}12. DOCUMENT MANAGEMENT${NC}"
echo "----------------------------------------"

test_endpoint "Get Documents" "GET" "/api/documents" "200"

# ============================================
# FINAL SUMMARY
# ============================================
echo -e "\n${BOLD}========================================${NC}"
echo -e "${BOLD}  TEST SUMMARY${NC}"
echo -e "${BOLD}========================================${NC}"
echo -e "Total Tests:   ${BOLD}$TOTAL_TESTS${NC}"
echo -e "Passed:        ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed:        ${RED}$FAILED_TESTS${NC}"

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "\n${GREEN}${BOLD}🎉 ALL TESTS PASSED!${NC}\n"
    exit 0
else
    echo -e "\n${RED}${BOLD}⚠️  SOME TESTS FAILED${NC}\n"
    exit 1
fi
