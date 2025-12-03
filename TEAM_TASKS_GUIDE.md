# Team & Task Management Guide

## Overview

The Team & Task Management module helps you organize your workforce and track all activities related to tender operations. Perfect for managing 10-20 team members across multiple firms and projects.

---

## 👥 Team Members

### Adding Team Members

1. Navigate to **Team & Tasks → Team Members**
2. Click **+ Add Team Member**
3. Fill in details:
   - **Name** (required)
   - **Designation**: Manager, Coordinator, Accountant, etc.
   - **Department**: management, operations, accounts, documentation, field
   - **Role** (required):
     - `admin` - Full system access
     - `manager` - Oversee teams and projects
     - `coordinator` - Coordinate tender activities
     - `accountant` - Handle financial matters
     - `document_handler` - Manage paperwork
     - `field_officer` - Site visits and field work
   - **Email & Mobile**: Contact information
   - **Status**: active, inactive, on_leave
   - **Joining Date**
   - **Notes**: Additional information

### Example Team Structure

```
Management Team:
├─ Md. Kamal Hossain - Manager (admin)
├─ Fatema Begum - Senior Coordinator (manager)

Operations Team:
├─ Abdul Rahman - Tender Coordinator (coordinator)
├─ Sultana Akhter - Document Officer (document_handler)

Accounts Team:
├─ Jahangir Alam - Senior Accountant (accountant)

Field Team:
└─ Rafiqul Islam - Field Officer (field_officer)
```

---

## ✅ Task Management

### Task Types

- **tender_preparation** - Preparing tender documents, schedules
- **document_collection** - Getting licenses, certificates, NOCs
- **bank_work** - Bank guarantees, pay orders, account opening
- **site_visit** - Visit project sites, measurement
- **license_renewal** - Renewing trade license, enlistment
- **meeting** - Client meetings, site meetings
- **payment_followup** - Bill follow-up, payment collection
- **other** - General tasks

### Priority Levels

- 🔴 **High** - Urgent, critical tasks
- 🟡 **Medium** - Important, standard deadline
- 🟢 **Low** - Non-urgent, flexible timing

### Task Status

- **pending** - Not started yet
- **in_progress** - Currently working on it
- **completed** - Finished successfully
- **on_hold** - Temporarily paused
- **cancelled** - No longer needed

### Creating Tasks

1. Click **Team & Tasks → Tasks**
2. Click **+ Add Task**
3. Fill in:
   - **Title** (required): Brief description
   - **Description**: Detailed information
   - **Task Type** (required)
   - **Priority**: high/medium/low
   - **Status**: pending/in_progress/etc.
   - **Assigned To**: Select team member
   - **Related Firm**: Link to firm if applicable
   - **Due Date**: Deadline
   - **Estimated Hours**: Time estimate
   - **Notes**: Additional context

### Example Tasks

#### Task 1: Prepare Tender for PWD
```
Title: Prepare tender documents for PWD Dhaka Road Project
Type: tender_preparation
Priority: high
Assigned To: Abdul Rahman (Tender Coordinator)
Related Firm: ABC Construction Ltd
Due Date: 2025-12-10
Estimated: 8 hours
Status: in_progress
```

#### Task 2: Collect Bank Guarantee
```
Title: Get bank guarantee from Sonali Bank for Tender #1234567
Type: bank_work
Priority: high
Assigned To: Jahangir Alam (Accountant)
Related Firm: ABC Construction Ltd
Due Date: 2025-12-08
Estimated: 4 hours
Status: pending
```

#### Task 3: Renew Trade License
```
Title: Renew trade license for Green Build Ltd at DCC
Type: license_renewal
Priority: medium
Assigned To: Sultana Akhter (Document Officer)
Related Firm: Green Build Ltd
Due Date: 2025-12-20
Estimated: 6 hours
Status: pending
```

#### Task 4: Site Visit
```
Title: Visit LGED Manikganj project site for measurement
Type: site_visit
Priority: medium
Assigned To: Rafiqul Islam (Field Officer)
Related Firm: Blue Infrastructure
Due Date: 2025-12-15
Estimated: 10 hours
Status: pending
```

---

## 📊 Dashboard Integration

The dashboard now shows:

### New Statistics Cards
- **Pending Tasks** - All tasks not completed/cancelled
- **Overdue Tasks** - Tasks past due date (RED alert)

### My Tasks Widget
Shows top 5 pending tasks with:
- Task title
- Priority badge
- Task type badge
- Overdue indicator
- Assigned person
- Due date

---

## 🎯 Workflow Examples

### Scenario 1: New Tender Discovered

**Day 1: Tender Discovery**
1. Add tender to system (status: discovered)
2. Create task:
   - Title: "Evaluate PWD tender feasibility"
   - Type: tender_preparation
   - Assigned: Senior Coordinator
   - Due: 2 days

**Day 3: Decision to Participate**
1. Update tender status to "preparing"
2. Create multiple tasks:
   ```
   Task A: Collect firm documents (document_handler)
   Task B: Get bank guarantee (accountant)
   Task C: Prepare technical proposal (coordinator)
   Task D: Prepare financial proposal (manager)
   Task E: Final review before submission (admin)
   ```

**Day 10: Submission**
1. Mark all tasks as completed
2. Update tender status to "submitted"

### Scenario 2: License Renewal Alert

When alert generates "Trade License expiring in 15 days":

1. **Automatic Alert** appears in dashboard
2. **Create Task**:
   - Title: "Renew ABC Construction trade license"
   - Type: license_renewal
   - Assigned: Document Handler
   - Priority: high (due to alert)
   - Due Date: 7 days before expiry
3. Document handler:
   - Collects required papers
   - Updates task to "in_progress"
   - Submits to City Corporation
   - Updates task to "completed"
4. **Update License** record with new expiry date

### Scenario 3: Weekly Team Meeting

**Monday Morning Workflow:**

1. **Manager** opens dashboard
2. Reviews **Overdue Tasks** (red count)
3. Checks **My Tasks widget**
4. Goes to **Tasks** page
5. Filters by:
   - Status: pending + in_progress
   - Team member: (each person)
6. Assigns new tasks for the week
7. Follows up on overdue items

---

## 🔍 Task Filtering

Use filters to manage workload:

### By Status
- View all pending tasks
- Track in-progress work
- Review completed tasks

### By Priority
- Focus on high-priority items
- Schedule medium-priority tasks
- Plan low-priority work

### By Team Member
- Check individual workload
- Balance task distribution
- Monitor performance

### Example Queries
```
High priority + Overdue = URGENT ACTION NEEDED
Pending + Assigned to me = MY TODO LIST
In Progress + High Priority = FOCUS NOW
```

---

## 💡 Best Practices

### 1. Daily Task Review (10 minutes)
- Check overdue tasks
- Update task status
- Add new urgent tasks

### 2. Task Assignment Strategy
- Match task type to team role
- Consider current workload
- Set realistic deadlines

### 3. Workload Balancing
```
Good Distribution:
- Coordinator: 5 active tasks
- Accountant: 3 active tasks
- Document Handler: 4 active tasks
- Field Officer: 2 active tasks

Overload Warning:
- Anyone with 8+ pending tasks
- Anyone with 3+ overdue tasks
```

### 4. Task Dependencies
Link tasks to:
- **Firms** - Who is this for?
- **Tenders** - Which tender?
- **Projects** - Which project?

### 5. Time Tracking
- Estimate hours realistically
- Use for future planning
- Track actual vs. estimated

---

## 📈 Team Performance Insights

### Individual Statistics
Each team member profile shows:
- Total tasks assigned
- Completed tasks count
- Active tasks count
- Pending tasks count

### Use This Data To:
- Recognize high performers
- Identify training needs
- Balance workload
- Plan capacity

---

## 🚨 Alert-to-Task Workflow

**System generates alerts → You create tasks**

| Alert Type | Task Type | Priority |
|------------|-----------|----------|
| License expiring ≤7 days | license_renewal | HIGH |
| BG expiring ≤7 days | bank_work | HIGH |
| Tender deadline ≤2 days | tender_preparation | HIGH |
| Tax deadline ≤3 days | payment_followup | HIGH |
| Enlistment expiring ≤30 days | license_renewal | MEDIUM |

### Automated Response Example
```
Alert: "Trade License expiring in 5 days"
↓
Action: Create Task
  - Title: Urgent: Renew trade license
  - Type: license_renewal
  - Priority: HIGH
  - Assigned: Document Handler
  - Due: 2 days (3 days buffer)
```

---

## 📱 Quick Actions

### Add Team Member (30 seconds)
```
Name: Jamal Uddin
Designation: Accountant
Department: accounts
Role: accountant
Mobile: 01712345678
Status: active
```

### Add Task (1 minute)
```
Title: Collect PWD enlistment renewal papers
Type: document_collection
Priority: medium
Assigned To: Sultana (Document Officer)
Due Date: 2025-12-20
```

### Update Task Status
1. Find task in list
2. Click **Edit**
3. Change status to "in_progress" or "completed"
4. Add notes if needed
5. Save

---

## 🎓 Training Team Members

### For Team Members:
- Show them how to view their tasks
- Explain priority levels
- Teach task status updates
- Demonstrate filters

### For Managers:
- Task creation workflow
- Workload distribution
- Performance monitoring
- Priority management

---

## 🔗 Integration with Other Modules

### Tasks Link To:
- **Firms** - Firm-specific tasks
- **Tenders** - Tender preparation tasks
- **Projects** - Project execution tasks
- **Alerts** - Create tasks from alerts
- **Team** - Assign to team members

### Dashboard Shows:
- Task statistics
- Pending tasks count
- Overdue tasks count
- Recent tasks widget

---

## 📊 Sample Team Setup

### Complete Team Example

**ABC Tender Solutions**

```
Admin Level:
└─ Md. Hasan (admin) - Overall management

Management:
├─ Rehana Sultana (manager) - Tender operations
└─ Kamal Pasha (manager) - Accounts & finance

Operations:
├─ Abdul Majid (coordinator) - Tender coordination
├─ Nasima Begum (coordinator) - Documentation
└─ Rafiq Miah (field_officer) - Site work

Accounts:
├─ Zahid Hasan (accountant) - Main accountant
└─ Farhana Islam (accountant) - Assistant accountant

Documentation:
└─ Sultana Akhter (document_handler) - Document processing
```

**Common Tasks for This Team:**
- Abdul Majid: Tender evaluation, preparation
- Nasima Begum: Document collection, submission
- Rafiq Miah: Site visits, measurements
- Zahid Hasan: Bank work, payments
- Farhana Islam: Payment follow-ups
- Sultana Akhter: License renewals, filing

---

## 🎯 Success Metrics

Track these weekly:
- ✅ Tasks completed on time
- ⚠️ Tasks overdue
- 📊 Tasks per team member
- 🎯 High-priority completion rate
- ⏱️ Average completion time

---

## 💼 Real-World Example: Weekly Schedule

### Monday
- Create tasks for the week
- Assign based on team capacity
- Set priorities

### Tuesday-Thursday
- Execute tasks
- Update status regularly
- Handle urgent items

### Friday
- Review completed tasks
- Close finished items
- Plan next week

---

Your team management system is now complete! Start by adding your team members, then create tasks for ongoing work. The dashboard will help you track everything in real-time.

**Next Steps:**
1. Add all team members
2. Create tasks for current tenders
3. Link tasks to firms/tenders
4. Review dashboard daily
5. Update task status as work progresses
