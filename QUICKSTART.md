# Quick Start Guide - Bangladesh Tender Management System

## 🚀 Getting Started in 5 Minutes

### Step 1: Initialize System
```bash
npm install
npm run init-db
npm start
```

### Step 2: Open Application
Visit: **http://localhost:3000/app.html**

---

## 📝 Sample Workflow

### Scenario: Managing a Tender for Construction Firm

#### 1. **Add Your First Firm** (2 minutes)
- Click **Firms** in sidebar
- Click **+ Add Firm**
- Enter:
  - Name: "ABC Construction Ltd"
  - Type: "Private Ltd"
  - TIN: "123456789012"
  - Mobile: "01712345678"
- Click **Save**

#### 2. **Add Trade License** (2 minutes)
- Click **Licenses** in sidebar
- Click **+ Add License**
- Select:
  - Firm: "ABC Construction Ltd"
  - Type: "trade_license"
  - License No: "DCC/2024/12345"
  - Authority: "Dhaka City Corporation"
  - Issue Date: 2024-01-01
  - Expiry Date: 2025-06-30 (6 months from now)
- Click **Save**

🔔 **System will automatically alert you 30, 15, and 7 days before expiry!**

#### 3. **Add Enlistment** (2 minutes)
- Click **Enlistments**
- Click **+ Add Enlistment**
- Enter:
  - Firm: "ABC Construction Ltd"
  - Authority: "RAJUK"
  - Category: "A"
  - Work Type: "Building Construction"
  - Number: "RAJUK/ENL/2024/456"
  - Expiry: 2025-12-31
- Click **Save**

🔔 **Alerts 90, 60, 30 days before expiry**

#### 4. **Add Bank Account** (1 minute)
- Click **Bank Accounts**
- Add account:
  - Firm: "ABC Construction Ltd"
  - Bank: "Sonali Bank"
  - Branch: "Motijheel"
  - Account No: "1234567890"
  - Type: "current"

#### 5. **Track a Tender** (3 minutes)
- Click **Tenders**
- Click **+ Add Tender**
- Enter:
  - Tender ID: "1234567" (from e-GP)
  - Procuring Entity: "PWD, Dhaka"
  - Type: "Works"
  - Method: "OTM"
  - Value: 50000000 (৳5 Crore)
  - Assigned Firm: "ABC Construction Ltd"
  - Submission Date: 2025-01-15
  - Status: "preparing"
- Click **Save**

🔔 **Submission deadline alert 7, 5, 2 days before**

#### 6. **Add Bank Guarantee for Tender** (2 minutes)
- Click **Bank Guarantees**
- Add:
  - Firm: "ABC Construction Ltd"
  - Type: "tender_security"
  - Bank: "Sonali Bank"
  - Amount: 1000000 (2% of ৳5 Crore)
  - Issue Date: 2024-12-01
  - Expiry Date: 2025-02-15
- Click **Save**

🔔 **Expiry alert 30, 15, 7 days before**

#### 7. **Add Tax Compliance** (2 minutes)
- Click **Tax Compliance**
- Add monthly VAT:
  - Firm: "ABC Construction Ltd"
  - Type: "monthly_vat"
  - FY: "2024-2025"
  - Month: "December"
  - Due Date: 2025-01-15
  - Amount: 50000
- Click **Save**

🔔 **Due date alert 15, 7, 3 days before**

---

## 🎯 Key Features in Action

### Dashboard View
The dashboard shows:
- **Total firms**: 1
- **Active tenders**: 1
- **Ongoing projects**: 0
- **Critical alerts**: (depends on dates)

### Alert System
Alerts automatically appear for:
- ⚠️ **Trade License** expiring in 6 months
- ⚠️ **Bank Guarantee** expiring in 2.5 months
- ⚠️ **Tender Submission** deadline
- ⚠️ **Tax Payment** due date

### Monitoring
View all data in organized tables:
- Filter by firm
- Sort by date
- Edit/Delete easily
- Visual status badges

---

## 💡 Pro Tips

### 1. **Set Realistic Expiry Dates**
When testing, set expiry dates 20-30 days from today to see alerts immediately.

Example:
```javascript
Today: 2025-12-03
License Expiry: 2025-12-25 (22 days)
→ Will show YELLOW (medium priority) alert
```

### 2. **Multiple Firms**
Add 2-3 firms to see how the system manages multiple entities:
- ABC Construction Ltd
- XYZ Trading
- Delta Engineering

### 3. **Consortium Tenders**
For joint ventures:
- Add tender with lead firm
- Use "Tender Assignments" (future feature)

### 4. **Monitor Bank Guarantees**
Critical for cash flow:
- Track all active BGs
- Monitor commission costs
- Get expiry alerts
- Plan extensions

### 5. **Regular Updates**
Update tender status as it progresses:
- discovered → evaluated → preparing → submitted → won

---

## 🔄 Daily/Weekly Tasks

### Daily (Morning)
1. Check **Dashboard** for critical alerts
2. Review **Tenders** with upcoming deadlines
3. Update tender statuses

### Weekly (Monday)
1. Review all **Alerts**
2. Plan license/enlistment renewals
3. Check **Bank Guarantees** expiring soon
4. Update **Tax Compliance** records

### Monthly
1. Add monthly VAT records
2. Review all **Bank Accounts**
3. Update **Loan** payments
4. Generate reports (future feature)

---

## 📊 Sample Data for Testing

### Quick Test Setup (Copy-Paste Ready)

**Firm 1:**
- Name: Green Build Ltd
- Type: Private Ltd
- TIN: 111111111111
- Mobile: 01711111111

**Firm 2:**
- Name: Blue Infrastructure
- Type: Partnership
- TIN: 222222222222
- Mobile: 01722222222

**License (expiring soon):**
- Firm: Green Build Ltd
- Type: trade_license
- Expiry: 2026-01-15 (42 days from Dec 3, 2025)
- → Will generate LOW priority alert

**Bank Guarantee (critical):**
- Firm: Green Build Ltd
- Type: tender_security
- Amount: 500000
- Expiry: 2025-12-20 (17 days)
- → Will generate MEDIUM priority alert

**Tender (urgent):**
- ID: 9876543
- Entity: LGED Dhaka
- Value: 20000000
- Submission: 2025-12-08 (5 days)
- → Will generate MEDIUM priority alert

---

## 🎓 Understanding Alerts

### Priority Levels

| Priority | Color | License | Enlistment | BG | Tax | Tender |
|----------|-------|---------|------------|----|----|--------|
| 🔴 HIGH | Red | ≤7 days | ≤30 days | ≤7 days | ≤3 days | ≤2 days |
| 🟡 MEDIUM | Yellow | ≤30 days | ≤60 days | ≤15 days | ≤7 days | ≤5 days |
| 🟢 LOW | Green | ≤60 days | ≤90 days | ≤30 days | ≤15 days | ≤7 days |

### Alert Actions
- **View**: See details in alerts page
- **Acknowledge**: Mark as seen (moves to history)
- **Dismiss**: Remove if not relevant
- **Auto-Delete**: Completed alerts deleted after 30 days

---

## 🛠️ Troubleshooting

### No Alerts Showing?
1. Check if data has future dates within alert windows
2. Run manual generation: `npm run generate-alerts`
3. Refresh browser

### Can't See Firm in Dropdown?
1. Add firm first in **Firms** page
2. Refresh the page
3. Open modal again

### Server Not Starting?
1. Check if port 3000 is available
2. Kill existing process: `pkill -f "node.*server.js"`
3. Restart: `npm start`

---

## 📱 Access Points

- **Main Dashboard**: http://localhost:3000/app.html
- **Legacy Tender Form**: http://localhost:3000/index.html
- **Dashboard (Old)**: http://localhost:3000/dashboard.html

---

## 🎉 You're Ready!

The system is now:
✅ Tracking your firms
✅ Monitoring compliance
✅ Alerting you about deadlines
✅ Managing tenders
✅ Securing your business operations

**Start adding real data and let the system work for you!**

---

## 📞 Need Help?

Common questions:
- How to add consortium tender? → Add primary firm, note others in description
- How to track project payments? → Use **Projects** module
- How to export data? → Coming in next version
- Multi-user access? → Planned for future release

**The system saves everything automatically - no manual save needed!**
