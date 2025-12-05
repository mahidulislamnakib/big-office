# Big Office - Office, Projects & Procurement Management Platform

**Version**: 3.1.0 | **Status**: Production Ready ✅

A comprehensive multi-module management platform for construction and contracting firms in Bangladesh. Handle offices, projects, procurement, officers directory, documents, banking, compliance, and team operations in one unified system.

Big Office combines powerful features across six major modules: **Tenders & Procurement**, **Project Tracking**, **Officers & Team Directory**, **Document Management**, **Financial & Banking Operations**, and **Compliance & Licensing**. Designed specifically for construction firms to manage the complete business lifecycle from tender discovery to project completion.

> ⚠️ **Production Note**: This is a demo system. Before deploying to production, implement proper password hashing (bcrypt) and SSL/TLS. See [DEPLOYMENT.md](DEPLOYMENT.md) for details.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Initialize database
npm run init-db

# (Optional) Load demo data
node seed-demo-data.js

# Start server
npm start

# Access: http://localhost:3000
```

**Demo Login Credentials:**
- Admin: `admin` / `demo123` (Full access)
- Manager: `manager` / `demo123` (Firm 1 only)
- User: `accounts` / `demo123` (All firms, limited actions)

## Features

### 🏢 Firm Management
- Track multiple firms with categories (Building, Road, Bridge, Water, Electrical, etc.)
- Store complete business information
- Monitor firm status and activity
- Search and filter functionality
- Export to CSV

### 📜 Compliance & Licensing
- **Trade License**: Automatic expiry tracking and renewal alerts
- **Enlistments**: RAJUK, PWD, LGED, RHD, BWDB with category tracking
- **TIN & VAT**: Registration and renewal management
- **IRC**: Import Registration Certificate tracking
- **Fire License**: Annual renewal monitoring

### 💰 Tax Compliance
- Monthly VAT (Mushak 9.1, 9.3) tracking
- Annual income tax returns
- Advance tax payments
- TDS/WHT deductions
- Challan number recording

### 🏦 Banking & Finance
- **Bank Accounts**: Multiple accounts per firm (Current, Savings, CD, FDR)
- **Pay Orders**: Document purchase PO tracking
- **Bank Guarantees**: 
  - Tender Security (2-5%)
  - Performance Guarantee (10-15%)
  - Advance Payment Guarantee
  - Retention Money Guarantee
  - Automatic expiry alerts
- **Loans**: Working capital, term loans, credit facilities

### 📄 Tender Management
- e-GP tender tracking
- Status workflow: Discovered → Evaluated → Preparing → Submitted → Won/Lost
- Firm assignment (single or consortium)
- Cost tracking (document purchase, BG commission, preparation)
- Procurement methods: OTM, LTM, RFQ, Direct
- Types: Goods, Works, Services, Consultancy

### 🏗️ Project Management
- Contract value tracking
- Bill submission (Advance, Running, Final, Retention)
- Payment monitoring
- Outstanding amount tracking
- Completion percentage

### 🔔 Alert System
- **Automated Alerts** for:
  - License expiry (30/15/7 days before)
  - Enlistment expiry (90/60/30 days before)
  - Bank guarantee expiry (30/15/7 days before)
  - Tax deadlines (15/7/3 days before)
  - Tender submission deadlines
  - Loan maturity dates
- **Priority Levels**: High (Red), Medium (Yellow), Low (Green)
- Auto-cleanup of old alerts

### 👥 Contact Management
- Proprietors, Partners, Directors
- Authorized persons
- Employee records
- NID and contact information

### 👤 Team Management
- **Team Members**: Add and manage your workforce
  - Roles: admin, manager, coordinator, accountant, document_handler, field_officer
  - Departments: management, operations, accounts, documentation, field
  - Status tracking: active, inactive, on_leave
  - Contact information and joining dates
- **Task Statistics**: View workload per team member

### ✅ Task Management
- **Task Types**:
  - Tender preparation
  - Document collection
  - Bank work
  - Site visits
  - License renewals
  - Meetings
  - Payment follow-ups
- **Priority Levels**: High, Medium, Low
- **Status Tracking**: pending, in_progress, completed, on_hold, cancelled
- **Assignment**: Assign tasks to team members
- **Linking**: Connect tasks to firms, tenders, or projects
- **Due Dates**: Track deadlines and overdue tasks
- **Time Estimation**: Estimate and track hours

### 🚚 Supplier Management
- **Supplier Types**: material, equipment, subcontractor, consultant, service_provider
- **Categories**: cement, steel, electrical, machinery, labor, etc.
- **Payment Terms**: cash, credit (7/15/30 days)
- **Credit Management**: Track credit limits and current dues
- **Transaction History**: Purchase, payment, return records
- **Rating System**: 1-5 star supplier ratings
- **Status Tracking**: active, inactive, blacklisted

### 🏛️ Client Management
- **Organization Types**: government, semi_government, private, NGO, international
- **Departments**: PWD, LGED, RHD, BWDB, etc.
- **Regional Tracking**: 8 divisions of Bangladesh
- **Contact Management**: Multiple contacts per client
- **Payment Reputation**: excellent, good, average, poor
- **Payment Days Tracking**: Average payment processing time
- **Related Tenders**: View all tenders from each client

### 👨‍💼 User & Admin Management
- **User Roles**: admin, manager, user, viewer
- **Permission System**: Granular access control
- **Firm Access Control**: Restrict users to specific firms
- **Activity Logging**: Track all user actions
- **Department & Designation**: Organize by role
- **Status Management**: active, inactive, suspended

### 📑 Comprehensive Tender Summary Builder
- **Project Analysis**:
  - Financial summary with VAT calculations
  - Resource requirements (manpower, machinery, materials)
  - Time schedule and milestones
  - BOQ summary with major items
- **Technical Assessment**:
  - Similar project experience
  - Technical capacity evaluation
  - Challenges and solutions
  - Key personnel assignment
- **Financial Analysis**:
  - Profit margin calculation
  - Break-even analysis
  - Cash flow projections
- **Risk Management**:
  - Risk identification
  - Mitigation strategies
- **Decision Support**:
  - Recommendations (should_participate, risky, avoid)
  - Confidence levels (high, medium, low)
  - Executive summary generation

## Installation

1. **Install Dependencies**
```bash
npm install
```

2. **Initialize Database**
```bash
npm run init-db
```

3. **Start Server**
```bash
npm start
```

4. **Access Application**
- Main App: http://localhost:3000/app.html
- Tender Form: http://localhost:3000/index.html

## Usage

### Adding Firms
1. Go to **Firms** page
2. Click **+ Add Firm**
3. Fill in firm details
4. Save

### Managing Licenses
1. Navigate to **Licenses**
2. Add license details with expiry dates
3. System will auto-generate alerts 30/15/7 days before expiry

### Tracking Bank Guarantees
1. Go to **Bank Guarantees**
2. Add BG details (Type, Amount, Expiry)
3. Monitor expiry alerts
4. Track commission costs

### Tender Workflow
1. **Add Tender**: Enter tender details from e-GP
2. **Assign Firm**: Select which firm will bid
3. **Track Costs**: Add document purchase, BG costs
4. **Update Status**: Move through workflow stages
5. **Win/Loss**: Record outcome

### Alert Management
- **Automatic**: Alerts generate hourly
- **Manual**: Run `npm run generate-alerts`
- **Dashboard**: View all pending alerts
- **Dismiss**: Mark alerts as acknowledged

## Database Structure

### Core Tables
- `firms` - Business entities
- `licenses` - Trade licenses and registrations
- `enlistments` - Government authority enlistments
- `tax_compliance` - Tax obligations
- `bank_accounts` - Financial accounts
- `pay_orders` - Payment instruments
- `bank_guarantees` - Security instruments
- `loans` - Credit facilities
- `tenders` - Tender tracking
- `projects` - Won contracts
- `contacts` - People management
- `alerts` - Notification system

## Scripts

```bash
npm start              # Start server
npm run init-db        # Initialize database
npm run generate-alerts # Generate alerts manually
```

## Alert Generation Schedule

Alerts are automatically generated:
- **On Startup**: 5 seconds after server starts
- **Hourly**: Every 60 minutes
- **Manual**: Via API or command line

## API Endpoints

### Firms
- `GET /api/firms` - List all firms
- `GET /api/firms/:id` - Get firm details
- `POST /api/firms` - Create/update firm
- `DELETE /api/firms/:id` - Delete firm

### Licenses
- `GET /api/licenses` - List licenses
- `POST /api/licenses` - Create/update license
- `DELETE /api/licenses/:id` - Delete license

### Enlistments
- `GET /api/enlistments` - List enlistments
- `POST /api/enlistments` - Create/update
- `DELETE /api/enlistments/:id` - Delete

### Tax Compliance
- `GET /api/tax-compliance` - List tax records
- `POST /api/tax-compliance` - Create/update
- `DELETE /api/tax-compliance/:id` - Delete

### Banking
- `GET /api/bank-accounts` - List accounts
- `GET /api/pay-orders` - List pay orders
- `GET /api/bank-guarantees` - List guarantees
- `GET /api/loans` - List loans
- `POST /api/[resource]` - Create/update
- `DELETE /api/[resource]/:id` - Delete

### Tenders & Projects
- `GET /api/tenders` - List tenders
- `GET /api/projects` - List projects
- `POST /api/[resource]` - Create/update
- `DELETE /api/[resource]/:id` - Delete

### Alerts
- `GET /api/alerts` - List alerts
- `POST /api/alerts/generate` - Generate alerts manually
- `GET /api/alerts/stats` - Get alert statistics
- `POST /api/alerts/:id/acknowledge` - Dismiss alert

### Team Members
- `GET /api/team-members` - List team members (filter by status)
- `GET /api/team-members/:id` - Get member details with task stats
- `POST /api/team-members` - Create team member
- `PUT /api/team-members/:id` - Update team member
- `DELETE /api/team-members/:id` - Delete team member

### Tasks
- `GET /api/tasks` - List tasks (filter by status, priority, assigned_to, firm, tender, project)
- `GET /api/tasks/:id` - Get task details with comments
- `POST /api/tasks` - Create task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/comments` - Add comment to task
- `GET /api/tasks/stats/overview` - Get task statistics

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics (includes task stats)

### Suppliers
- `GET /api/suppliers` - List suppliers (filter by type, status)
- `GET /api/suppliers/:id` - Get supplier with transaction history
- `POST /api/suppliers` - Create supplier
- `PUT /api/suppliers/:id` - Update supplier
- `DELETE /api/suppliers/:id` - Delete supplier
- `POST /api/suppliers/:id/transactions` - Add transaction

### Clients
- `GET /api/clients` - List clients (filter by type, region)
- `GET /api/clients/:id` - Get client with contacts and tenders
- `POST /api/clients` - Create client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete client
- `POST /api/clients/:id/contacts` - Add client contact

### Users & Admin
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user with activity log
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Tender Summaries
- `GET /api/tender-summaries` - List summaries (filter by tender, firm)
- `GET /api/tender-summaries/:id` - Get detailed summary
- `POST /api/tender-summaries` - Create summary
- `PUT /api/tender-summaries/:id` - Update summary
- `DELETE /api/tender-summaries/:id` - Delete summary

## Bangladesh-Specific Features

✅ Multiple enlistment authorities (RAJUK, PWD, LGED, RHD, BWDB)
✅ Trade License tracking with City Corporation/Municipality support
✅ TIN & VAT compliance (Mushak forms)
✅ Bank Guarantee types (Tender Security, Performance, Advance Payment)
✅ e-GP portal integration support
✅ Procurement methods (OTM, LTM, RFQ, Direct)
✅ BDT currency formatting (৳)
✅ Fiscal year support (July-June)

## System Requirements

- Node.js v14 or higher
- SQLite3 (via better-sqlite3)
- Modern web browser

## Technology Stack

- **Backend**: Node.js + Express
- **Database**: SQLite3
- **Frontend**: Vanilla JavaScript + HTML5 + CSS3
- **No external dependencies** for frontend

## Data Security

- Local SQLite database (no cloud dependency)
- All data stored on your machine
- No external API calls
- Full data ownership

## Future Enhancements

- [ ] Email notifications for alerts
- [ ] SMS gateway integration
- [ ] Bengali language support
- [ ] Document upload system
- [ ] PDF report generation
- [ ] Mobile app
- [ ] Multi-user authentication
- [ ] Role-based access control
- [ ] Data export (Excel/PDF)
- [ ] e-GP portal scraper
- [ ] Advanced analytics dashboard

## Support

For issues or questions about Bangladesh-specific requirements, please consult:
- Public Procurement Rules (PPR) 2008
- BPPA (Bangladesh Public Procurement Authority) guidelines
- CPTU (Central Procurement Technical Unit) regulations

## License

Private Use - All Rights Reserved

## Version

1.0.0 - Initial Release

---

**Built for Bangladesh Tender Business Management**
