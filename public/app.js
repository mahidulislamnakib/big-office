// app.js - Big Office Tender Management System
const API = '/api';
let currentFirms = [];
let currentModal = null;
let currentId = null;
let currentUser = null;

const app = {
  init() {
    // Load user from localStorage
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    
    this.setupNavigation();
    this.checkPermissions();
    this.loadDashboard();
    this.loadFirmsForFilters();
  },

  checkPermissions() {
    // Hide modules based on user role
    if (currentUser.role !== 'admin') {
      // Non-admin users - hide certain menu items
      const restrictedPages = ['users']; // Users management only for admin
      
      restrictedPages.forEach(pageId => {
        const menuItem = document.querySelector(`[data-page="${pageId}"]`);
        if (menuItem) {
          menuItem.style.display = 'none';
        }
      });
    }
  },

  getUserFirmFilter() {
    // Return firm filter for non-admin users
    if (currentUser.role === 'admin' || !currentUser.firm_access) {
      return null; // Admin sees all
    }
    
    // Parse firm_access (comma-separated IDs or 'all')
    if (currentUser.firm_access === 'all') {
      return null;
    }
    
    const firmIds = currentUser.firm_access.split(',').map(id => id.trim()).filter(id => id);
    return firmIds.length > 0 ? firmIds[0] : null; // Return first firm ID
  },

  setupNavigation() {
    document.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.getAttribute('data-page');
        this.showPage(page);
        
        document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
        item.classList.add('active');
      });
    });
  },

  showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    // Load data for the page
    const loaders = {
      dashboard: () => this.loadDashboard(),
      firms: () => this.loadFirms(),
      licenses: () => this.loadLicenses(),
      enlistments: () => this.loadEnlistments(),
      tax: () => this.loadTaxCompliance(),
      accounts: () => this.loadBankAccounts(),
      'pay-orders': () => this.loadPayOrders(),
      guarantees: () => this.loadBankGuarantees(),
      loans: () => this.loadLoans(),
      tenders: () => this.loadTenders(),
      projects: () => this.loadProjects(),
      alerts: () => this.loadAllAlerts(),
      contacts: () => this.loadContacts(),
      team: () => this.loadTeamMembers(),
      tasks: () => this.loadTasks(),
      suppliers: () => this.loadSuppliers(),
      clients: () => this.loadClients(),
      users: () => this.loadUsers(),
      'tender-summaries': () => this.loadTenderSummaries(),
      letters: () => this.loadLetters(),
      expenses: () => this.loadExpenses()
    };
    
    if (loaders[pageId]) loaders[pageId]();
  },

  async loadDashboard() {
    try {
      const firmFilter = this.getUserFirmFilter();
      const firmParam = firmFilter ? `?firm_id=${firmFilter}` : '';
      
      const [stats, tenders, alerts, bgs, tasks] = await Promise.all([
        fetch(`${API}/dashboard/stats${firmParam}`).then(r => r.json()),
        fetch(`${API}/tenders${firmParam}`).then(r => r.json()),
        fetch(`${API}/alerts${firmParam ? firmParam + '&' : '?'}status=pending`).then(r => r.json()),
        fetch(`${API}/bank-guarantees${firmParam}`).then(r => r.json()),
        fetch(`${API}/tasks${firmParam ? firmParam + '&' : '?'}status=pending`).then(r => r.json())
      ]);

      this.animateValue('stat-firms', 0, stats.firms.count, 600);
      this.animateValue('stat-tenders', 0, stats.tenders.total.count, 600);
      this.animateValue('stat-projects', 0, stats.projects.total.count, 600);
      this.animateValue('stat-alerts', 0, stats.alerts.high.count, 600);
      this.animateValue('stat-tasks', 0, stats.tasks.total.count || 0, 600);
      this.animateValue('stat-overdue', 0, stats.tasks.overdue.count || 0, 600);

      // Alerts widget
      const alertsWidget = document.getElementById('alerts-widget');
      if (alerts.length === 0) {
        alertsWidget.innerHTML = '<div class="empty-state" style="padding:20px">No pending alerts</div>';
      } else {
        alertsWidget.innerHTML = alerts.slice(0, 5).map(a => `
          <div class="alert alert-${a.priority === 'high' ? 'danger' : 'warning'}">
            <strong>${a.title}</strong><br>
            <small>${a.message || ''}</small>
          </div>
        `).join('');
      }

      // BG widget
      const bgWidget = document.getElementById('bg-widget');
      const activeBGs = bgs.filter(bg => bg.status === 'active');
      if (activeBGs.length === 0) {
        bgWidget.innerHTML = '<div class="empty-state" style="padding:20px">No active bank guarantees</div>';
      } else {
        bgWidget.innerHTML = `
          <table style="font-size:12px">
            <thead><tr><th>Type</th><th>Amount</th><th>Expiry</th></tr></thead>
            <tbody>
              ${activeBGs.slice(0, 5).map(bg => `
                <tr>
                  <td>${bg.bg_type}</td>
                  <td>৳${this.formatNumber(bg.amount)}</td>
                  <td>${bg.expiry_date || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
      
      // Tasks widget
      const tasksWidget = document.getElementById('tasks-widget');
      if (tasks.length === 0) {
        tasksWidget.innerHTML = '<div class="empty-state" style="padding:20px">No pending tasks</div>';
      } else {
        tasksWidget.innerHTML = `
          <div style="font-size:12px">
            ${tasks.slice(0, 5).map(t => {
              const isOverdue = t.due_date && new Date(t.due_date) < new Date();
              return `
                <div style="padding:8px; border-bottom:1px solid #eee; ${isOverdue ? 'background:#fff3f3' : ''}">
                  <strong>${t.title}</strong>
                  <div style="display:flex; gap:8px; margin-top:4px;">
                    <span class="badge badge-${t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'info'}">${t.priority}</span>
                    <span class="badge badge-secondary">${t.task_type}</span>
                    ${isOverdue ? '<span class="badge badge-danger">Overdue</span>' : ''}
                  </div>
                  <small style="color:#666">${t.assigned_to_name || 'Unassigned'} • ${t.due_date || 'No deadline'}</small>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      // Recent tenders
      const tbody = document.querySelector('#recent-tenders tbody');
      if (tenders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No tenders found</td></tr>';
      } else {
        tbody.innerHTML = tenders.slice(0, 10).map(t => `
          <tr>
            <td>${t.tender_id || '-'}</td>
            <td>${t.procuring_entity || '-'}</td>
            <td>${t.proc_type || '-'}</td>
            <td><span class="badge badge-${this.getStatusColor(t.status)}">${t.status}</span></td>
            <td>${t.lastSubmission || '-'}</td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Dashboard error:', err);
    }
  },

  async loadFirms() {
    try {
      const firmFilter = this.getUserFirmFilter();
      const url = firmFilter ? `${API}/firms?id=${firmFilter}` : `${API}/firms`;
      
      const firms = await fetch(url).then(r => r.json());
      currentFirms = Array.isArray(firms) ? firms : [firms]; // Handle single firm response
      
      const list = document.getElementById('firms-list');
      if (currentFirms.length === 0) {
        list.innerHTML = '<tr><td colspan="7" class="empty-state">No firms found. Add your first firm!</td></tr>';
      } else {
        list.innerHTML = currentFirms.map(f => {
          const categories = (f.category || '').split(',').filter(c => c);
          const categoryBadges = categories.map(cat => {
            const labels = {
              building: 'Building',
              road: 'Road',
              bridge: 'Bridge',
              water: 'Water',
              electrical: 'Electrical',
              mechanical: 'Mechanical',
              supply: 'Supply',
              consultancy: 'Consultancy'
            };
            return `<span class="badge badge-info" style="font-size:10px; margin:2px;">${labels[cat] || cat}</span>`;
          }).join('');
          
          return `
          <tr>
            <td><strong>${f.name}</strong></td>
            <td>${f.business_type || '-'}</td>
            <td>${categoryBadges || '-'}</td>
            <td>${f.tin || '-'}</td>
            <td>${f.mobile || f.phone || '-'}</td>
            <td><span class="badge badge-${f.status === 'active' ? 'success' : 'secondary'}">${f.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('firm', ${f.id})">Edit</button>
              ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="app.deleteItem('firm', ${f.id})">Delete</button>` : ''}
            </td>
          </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Firms error:', err);
    }
  },

  async loadLicenses() {
    try {
      const userFirmFilter = this.getUserFirmFilter();
      const uiFirmFilter = document.getElementById('license-firm-filter')?.value || '';
      const typeFilter = document.getElementById('license-type-filter')?.value || '';
      
      let url = `${API}/licenses`;
      const params = [];
      
      // Apply user's firm restriction first, then UI filter
      const finalFirmFilter = userFirmFilter || uiFirmFilter;
      if (finalFirmFilter) params.push(`firm_id=${finalFirmFilter}`);
      if (params.length) url += '?' + params.join('&');
      
      let licenses = await fetch(url).then(r => r.json());
      
      if (typeFilter) {
        licenses = licenses.filter(l => l.license_type === typeFilter);
      }
      
      const list = document.getElementById('licenses-list');
      if (licenses.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No licenses found</td></tr>';
      } else {
        list.innerHTML = licenses.map(l => {
          const isExpiringSoon = l.expiry_date && new Date(l.expiry_date) <= new Date(Date.now() + 30*24*60*60*1000) && l.status === 'active';
          return `
          <tr ${isExpiringSoon ? 'style="background:#fff8e1;"' : ''}>
            <td>${l.firm_name || '-'}</td>
            <td>${this.formatLicenseType(l.license_type)}</td>
            <td>${l.license_number || '-'}</td>
            <td>${l.issuing_authority || '-'}</td>
            <td>${l.issue_date || '-'}</td>
            <td>${l.expiry_date || '-'} ${isExpiringSoon ? '<br><span class="badge badge-warning" style="font-size:10px;">⚠ Expiring Soon</span>' : ''}</td>
            <td>${l.amount ? '৳'+this.formatNumber(l.amount) : '-'}</td>
            <td><span class="badge badge-${l.status === 'active' ? 'success' : 'danger'}">${l.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-secondary" onclick="app.editItem('license', ${l.id})">Edit</button>
              ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="app.deleteItem('license', ${l.id})">Delete</button>` : ''}
            </td>
          </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Licenses error:', err);
    }
  },

  async loadEnlistments() {
    try {
      const enlistments = await fetch(`${API}/enlistments`).then(r => r.json());
      
      const list = document.getElementById('enlistments-list');
      if (enlistments.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No enlistments found</td></tr>';
      } else {
        list.innerHTML = enlistments.map(e => {
          const isExpiringSoon = e.expiry_date && new Date(e.expiry_date) <= new Date(Date.now() + 30*24*60*60*1000) && e.status === 'active';
          return `
          <tr ${isExpiringSoon ? 'style="background:#fff8e1;"' : ''}>
            <td>${e.firm_name || '-'}</td>
            <td><span class="badge badge-primary" style="font-weight:600;">${e.authority}</span></td>
            <td><span class="badge badge-info">${e.category || '-'}</span></td>
            <td>${e.work_type || '-'}</td>
            <td>${e.enlistment_number || '-'}</td>
            <td>${e.issue_date || '-'}</td>
            <td>${e.expiry_date || '-'} ${isExpiringSoon ? '<br><span class="badge badge-warning" style="font-size:10px;">⚠ Expiring Soon</span>' : ''}</td>
            <td>${e.amount ? '৳'+this.formatNumber(e.amount) : '-'}</td>
            <td><span class="badge badge-${e.status === 'active' ? 'success' : 'danger'}">${e.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-secondary" onclick="app.editItem('enlistment', ${e.id})">Edit</button>
              ${currentUser.role === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="app.deleteItem('enlistment', ${e.id})">Delete</button>` : ''}
            </td>
          </tr>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Enlistments error:', err);
    }
  },

  async loadTaxCompliance() {
    try {
      const tax = await fetch(`${API}/tax-compliance`).then(r => r.json());
      
      const list = document.getElementById('tax-list');
      if (tax.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No tax records found</td></tr>';
      } else {
        list.innerHTML = tax.map(t => `
          <tr>
            <td>${t.firm_name || '-'}</td>
            <td>${t.compliance_type}</td>
            <td>${t.fiscal_year || ''} ${t.month || ''}</td>
            <td>${t.due_date || '-'}</td>
            <td>${t.submission_date || '-'}</td>
            <td>৳${this.formatNumber(t.amount)}</td>
            <td><span class="badge badge-${this.getStatusColor(t.status)}">${t.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('tax', ${t.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('tax', ${t.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Tax error:', err);
    }
  },

  async loadBankAccounts() {
    try {
      const accounts = await fetch(`${API}/bank-accounts`).then(r => r.json());
      
      const list = document.getElementById('accounts-list');
      if (accounts.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No bank accounts found</td></tr>';
      } else {
        list.innerHTML = accounts.map(a => `
          <tr>
            <td>${a.firm_name || '-'}</td>
            <td>${a.bank_name}</td>
            <td>${a.branch_name || '-'}</td>
            <td>${a.account_number}</td>
            <td>${a.account_type || '-'}</td>
            <td>৳${this.formatNumber(a.balance)}</td>
            <td><span class="badge badge-${a.status === 'active' ? 'success' : 'secondary'}">${a.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('account', ${a.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('account', ${a.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Accounts error:', err);
    }
  },

  async loadPayOrders() {
    try {
      const payorders = await fetch(`${API}/pay-orders`).then(r => r.json());
      
      const list = document.getElementById('payorders-list');
      if (payorders.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No pay orders found</td></tr>';
      } else {
        list.innerHTML = payorders.map(p => `
          <tr>
            <td>${p.firm_name || '-'}</td>
            <td>${p.po_number || '-'}</td>
            <td>${p.bank_name}</td>
            <td>৳${this.formatNumber(p.amount)}</td>
            <td>${p.in_favor_of || '-'}</td>
            <td>${p.issue_date || '-'}</td>
            <td><span class="badge badge-${this.getStatusColor(p.status)}">${p.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('payorder', ${p.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('payorder', ${p.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Pay orders error:', err);
    }
  },

  async loadBankGuarantees() {
    try {
      const guarantees = await fetch(`${API}/bank-guarantees`).then(r => r.json());
      
      const list = document.getElementById('guarantees-list');
      if (guarantees.length === 0) {
        list.innerHTML = '<tr><td colspan="9" class="empty-state">No bank guarantees found</td></tr>';
      } else {
        list.innerHTML = guarantees.map(bg => `
          <tr>
            <td>${bg.firm_name || '-'}</td>
            <td>${bg.bg_type}</td>
            <td>${bg.bg_number || '-'}</td>
            <td>${bg.bank_name}</td>
            <td>৳${this.formatNumber(bg.amount)}</td>
            <td>${bg.issue_date || '-'}</td>
            <td>${bg.expiry_date || '-'}</td>
            <td><span class="badge badge-${this.getStatusColor(bg.status)}">${bg.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('guarantee', ${bg.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('guarantee', ${bg.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Guarantees error:', err);
    }
  },

  async loadLoans() {
    try {
      const loans = await fetch(`${API}/loans`).then(r => r.json());
      
      const list = document.getElementById('loans-list');
      if (loans.length === 0) {
        list.innerHTML = '<tr><td colspan="9" class="empty-state">No loans found</td></tr>';
      } else {
        list.innerHTML = loans.map(l => `
          <tr>
            <td>${l.firm_name || '-'}</td>
            <td>${l.bank_name}</td>
            <td>${l.loan_type}</td>
            <td>৳${this.formatNumber(l.loan_amount)}</td>
            <td>৳${this.formatNumber(l.outstanding_amount)}</td>
            <td>${l.interest_rate}%</td>
            <td>${l.maturity_date || '-'}</td>
            <td><span class="badge badge-${this.getStatusColor(l.status)}">${l.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('loan', ${l.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('loan', ${l.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Loans error:', err);
    }
  },

  async loadTenders() {
    try {
      const tenders = await fetch(`${API}/tenders`).then(r => r.json());
      
      const list = document.getElementById('tenders-list');
      if (tenders.length === 0) {
        list.innerHTML = '<tr><td colspan="8" class="empty-state">No tenders found</td></tr>';
      } else {
        list.innerHTML = tenders.map(t => `
          <tr>
            <td>${t.tender_id || '-'}</td>
            <td>${t.procuring_entity || '-'}</td>
            <td>${t.proc_type || '-'}</td>
            <td>৳${this.formatNumber(t.tender_value)}</td>
            <td>${t.assigned_firm_name || '-'}</td>
            <td>${t.lastSubmission || '-'}</td>
            <td><span class="badge badge-${this.getStatusColor(t.status)}">${t.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('tender', ${t.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('tender', ${t.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Tenders error:', err);
    }
  },

  async loadProjects() {
    try {
      const projects = await fetch(`${API}/projects`).then(r => r.json());
      
      const list = document.getElementById('projects-list');
      if (projects.length === 0) {
        list.innerHTML = '<tr><td colspan="9" class="empty-state">No projects found</td></tr>';
      } else {
        list.innerHTML = projects.map(p => `
          <tr>
            <td><strong>${p.project_name}</strong></td>
            <td>${p.firm_name || '-'}</td>
            <td>৳${this.formatNumber(p.contract_value)}</td>
            <td>৳${this.formatNumber(p.total_billed)}</td>
            <td>৳${this.formatNumber(p.total_received)}</td>
            <td>৳${this.formatNumber(p.outstanding_amount)}</td>
            <td>${p.completion_percentage}%</td>
            <td><span class="badge badge-${this.getStatusColor(p.status)}">${p.status}</span></td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('project', ${p.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('project', ${p.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Projects error:', err);
    }
  },

  async loadAllAlerts() {
    try {
      const alerts = await fetch(`${API}/alerts`).then(r => r.json());
      
      const list = document.getElementById('alerts-list');
      if (alerts.length === 0) {
        list.innerHTML = '<div class="empty-state">No alerts found</div>';
      } else {
        list.innerHTML = alerts.map(a => `
          <div class="alert alert-${a.priority === 'high' ? 'danger' : 'warning'}">
            <div>
              <strong>${a.title}</strong><br>
              <small>${a.message || ''} - ${a.firm_name || ''}</small><br>
              <small>Due: ${a.due_date || 'N/A'}</small>
            </div>
            <button class="btn btn-sm btn-secondary" onclick="app.acknowledgeAlert(${a.id})">Dismiss</button>
          </div>
        `).join('');
      }
    } catch (err) {
      console.error('Alerts error:', err);
    }
  },

  async loadContacts() {
    try {
      const contacts = await fetch(`${API}/contacts`).then(r => r.json());
      
      const list = document.getElementById('contacts-list');
      if (contacts.length === 0) {
        list.innerHTML = '<tr><td colspan="7" class="empty-state">No contacts found</td></tr>';
      } else {
        list.innerHTML = contacts.map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.firm_name || '-'}</td>
            <td>${c.contact_type || '-'}</td>
            <td>${c.designation || '-'}</td>
            <td>${c.mobile || '-'}</td>
            <td>${c.email || '-'}</td>
            <td class="action-buttons">
              <button class="btn btn-sm btn-primary" onclick="app.editItem('contact', ${c.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="app.deleteItem('contact', ${c.id})">Delete</button>
            </td>
          </tr>
        `).join('');
      }
    } catch (err) {
      console.error('Contacts error:', err);
    }
  },

  async loadFirmsForFilters() {
    const firmFilter = this.getUserFirmFilter();
    const url = firmFilter ? `${API}/firms?id=${firmFilter}` : `${API}/firms`;
    
    const firms = await fetch(url).then(r => r.json());
    currentFirms = Array.isArray(firms) ? firms : (firms && firms.id ? [firms] : []);
    
    // Populate firm filters
    const selects = document.querySelectorAll('#license-firm-filter, select[id$="-firm"]');
    selects.forEach(select => {
      const currentValue = select.value;
      select.innerHTML = '<option value="">All Firms</option>' + 
        currentFirms.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
      select.value = currentValue;
    });
  },

  async openModal(type, id = null) {
    currentModal = type;
    currentId = id;
    
    const modal = document.getElementById('universalModal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    const saveBtn = document.getElementById('modal-save-btn');
    
    title.textContent = id ? `Edit ${type}` : `Add ${type}`;
    body.innerHTML = await this.getModalForm(type);
    
    if (id) {
      this.loadItemData(type, id);
    } else {
      await this.populateFirmSelects();
      if (type === 'tender-summary') {
        await this.populateTenderSummaryDropdowns();
      }
    }
    
    saveBtn.onclick = () => this.saveItem(type, id);
    modal.classList.add('active');
  },

  closeModal() {
    document.getElementById('universalModal').classList.remove('active');
    currentModal = null;
    currentId = null;
  },

  async getModalForm(type) {
    const firmSelect = `
      <select id="modal-firm-id" required>
        <option value="">Select Firm</option>
        ${currentFirms.map(f => `<option value="${f.id}">${f.name}</option>`).join('')}
      </select>
    `;

    const forms = {
      firm: `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Firm Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group">
            <label>Business Type</label>
            <select id="modal-business-type">
              <option>Proprietorship</option>
              <option>Partnership</option>
              <option>Private Ltd</option>
              <option>Public Ltd</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Category *</label>
            <select id="modal-category" multiple style="height: 80px;">
              <option value="building">Building Construction</option>
              <option value="road">Road & Highway</option>
              <option value="bridge">Bridge & Structure</option>
              <option value="water">Water & Sanitation</option>
              <option value="electrical">Electrical Works</option>
              <option value="mechanical">Mechanical Works</option>
              <option value="supply">Goods & Supply</option>
              <option value="consultancy">Consultancy Services</option>
            </select>
            <small style="color: #666;">Hold Ctrl/Cmd to select multiple</small>
          </div>
          <div class="form-group">
            <label>TIN</label>
            <input type="text" id="modal-tin">
          </div>
          <div class="form-group">
            <label>BIN</label>
            <input type="text" id="modal-bin">
          </div>
          <div class="form-group">
            <label>Established Date</label>
            <input type="date" id="modal-established-date">
          </div>
          <div class="form-group full-width">
            <label>Address</label>
            <textarea id="modal-address" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
        </div>
      `,
      license: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>License Type *</label>
            <select id="modal-license-type" required>
              <option value="trade_license">Trade License</option>
              <option value="tin">TIN</option>
              <option value="vat">VAT</option>
              <option value="irc">IRC</option>
              <option value="fire">Fire License</option>
              <option value="environmental">Environmental License</option>
            </select>
          </div>
          <div class="form-group">
            <label>License Number</label>
            <input type="text" id="modal-license-number">
          </div>
          <div class="form-group">
            <label>Issuing Authority</label>
            <select id="modal-issuing-authority">
              <option value="">Select Authority</option>
              <option value="City Corporation">City Corporation</option>
              <option value="Paurashava">Paurashava</option>
              <option value="Union Parishad">Union Parishad</option>
              <option value="NBR">NBR (National Board of Revenue)</option>
              <option value="RAJUK">RAJUK</option>
              <option value="Fire Service">Fire Service & Civil Defence</option>
              <option value="DoE">DoE (Department of Environment)</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Issue Date</label>
            <input type="date" id="modal-issue-date">
          </div>
          <div class="form-group">
            <label>Expiry Date</label>
            <input type="date" id="modal-expiry-date">
          </div>
          <div class="form-group">
            <label>Amount (BDT)</label>
            <input type="number" id="modal-amount">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="active">Active</option>
              <option value="expired">Expired</option>
              <option value="under_renewal">Under Renewal</option>
            </select>
          </div>
        </div>
      `,
      enlistment: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Authority *</label>
            <select id="modal-authority" required>
              <option>RAJUK</option>
              <option>PWD</option>
              <option>LGED</option>
              <option>RHD</option>
              <option>BWDB</option>
              <option>BTCL</option>
              <option>Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Category</label>
            <select id="modal-category">
              <option>A</option>
              <option>B</option>
              <option>C</option>
              <option>D</option>
              <option>E</option>
            </select>
          </div>
          <div class="form-group">
            <label>Work Type</label>
            <input type="text" id="modal-work-type" placeholder="Building, Road, etc.">
          </div>
          <div class="form-group">
            <label>Enlistment Number</label>
            <input type="text" id="modal-enlistment-number">
          </div>
          <div class="form-group">
            <label>Issue Date</label>
            <input type="date" id="modal-issue-date">
          </div>
          <div class="form-group">
            <label>Expiry Date</label>
            <input type="date" id="modal-expiry-date">
          </div>
          <div class="form-group">
            <label>Amount (BDT)</label>
            <input type="number" id="modal-amount">
          </div>
        </div>
      `,
      tax: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Compliance Type *</label>
            <select id="modal-compliance-type" required>
              <option value="monthly_vat">Monthly VAT</option>
              <option value="yearly_return">Yearly Return</option>
              <option value="advance_tax">Advance Tax</option>
              <option value="tds">TDS</option>
              <option value="wht">WHT</option>
            </select>
          </div>
          <div class="form-group">
            <label>Fiscal Year</label>
            <input type="text" id="modal-fiscal-year" placeholder="2024-2025">
          </div>
          <div class="form-group">
            <label>Month (if applicable)</label>
            <input type="text" id="modal-month" placeholder="January">
          </div>
          <div class="form-group">
            <label>Due Date</label>
            <input type="date" id="modal-due-date">
          </div>
          <div class="form-group">
            <label>Submission Date</label>
            <input type="date" id="modal-submission-date">
          </div>
          <div class="form-group">
            <label>Amount (BDT)</label>
            <input type="number" id="modal-amount">
          </div>
          <div class="form-group">
            <label>Challan Number</label>
            <input type="text" id="modal-challan-number">
          </div>
        </div>
      `,
      account: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Bank Name *</label>
            <input type="text" id="modal-bank-name" required>
          </div>
          <div class="form-group">
            <label>Branch Name</label>
            <input type="text" id="modal-branch-name">
          </div>
          <div class="form-group">
            <label>Account Number *</label>
            <input type="text" id="modal-account-number" required>
          </div>
          <div class="form-group">
            <label>Account Type</label>
            <select id="modal-account-type">
              <option value="current">Current Account</option>
              <option value="savings">Savings Account</option>
              <option value="cd">CD (Call Deposit)</option>
              <option value="fdr">FDR (Fixed Deposit)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Balance (BDT)</label>
            <input type="number" id="modal-balance">
          </div>
        </div>
      `,
      payorder: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Bank Name *</label>
            <input type="text" id="modal-bank-name" required>
          </div>
          <div class="form-group">
            <label>PO Number</label>
            <input type="text" id="modal-po-number">
          </div>
          <div class="form-group">
            <label>Amount (BDT) *</label>
            <input type="number" id="modal-amount" required>
          </div>
          <div class="form-group">
            <label>In Favor Of</label>
            <input type="text" id="modal-in-favor-of" placeholder="Procuring Entity">
          </div>
          <div class="form-group">
            <label>Purpose</label>
            <input type="text" id="modal-purpose" placeholder="Tender document purchase">
          </div>
          <div class="form-group">
            <label>Issue Date</label>
            <input type="date" id="modal-issue-date">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="active">Active</option>
              <option value="encashed">Encashed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>
      `,
      guarantee: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>BG Type *</label>
            <select id="modal-bg-type" required>
              <option value="tender_security">Tender Security</option>
              <option value="performance">Performance Guarantee</option>
              <option value="advance_payment">Advance Payment Guarantee</option>
              <option value="retention">Retention Guarantee</option>
            </select>
          </div>
          <div class="form-group">
            <label>Bank Name *</label>
            <input type="text" id="modal-bank-name" required>
          </div>
          <div class="form-group">
            <label>BG Number</label>
            <input type="text" id="modal-bg-number">
          </div>
          <div class="form-group">
            <label>Amount (BDT) *</label>
            <input type="number" id="modal-amount" required>
          </div>
          <div class="form-group">
            <label>Percentage (%)</label>
            <input type="number" step="0.01" id="modal-percentage">
          </div>
          <div class="form-group">
            <label>Issue Date</label>
            <input type="date" id="modal-issue-date">
          </div>
          <div class="form-group">
            <label>Expiry Date</label>
            <input type="date" id="modal-expiry-date">
          </div>
          <div class="form-group full-width">
            <label>In Favor Of</label>
            <input type="text" id="modal-in-favor-of" placeholder="Procuring Entity">
          </div>
        </div>
      `,
      loan: `
        <div class="form-grid">
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Bank Name *</label>
            <input type="text" id="modal-bank-name" required>
          </div>
          <div class="form-group">
            <label>Loan Type</label>
            <select id="modal-loan-type">
              <option value="working_capital">Working Capital</option>
              <option value="term_loan">Term Loan</option>
              <option value="overdraft">Overdraft</option>
              <option value="credit_limit">Credit Limit</option>
            </select>
          </div>
          <div class="form-group">
            <label>Loan Amount (BDT) *</label>
            <input type="number" id="modal-loan-amount" required>
          </div>
          <div class="form-group">
            <label>Interest Rate (%)</label>
            <input type="number" step="0.01" id="modal-interest-rate">
          </div>
          <div class="form-group">
            <label>Tenure (Months)</label>
            <input type="number" id="modal-tenure-months">
          </div>
          <div class="form-group">
            <label>Sanction Date</label>
            <input type="date" id="modal-sanction-date">
          </div>
          <div class="form-group">
            <label>Maturity Date</label>
            <input type="date" id="modal-maturity-date">
          </div>
        </div>
      `,
      tender: `
        <div class="form-grid">
          <div class="form-group">
            <label>Tender ID *</label>
            <input type="text" id="modal-tender-id" required>
          </div>
          <div class="form-group">
            <label>Procuring Entity *</label>
            <input type="text" id="modal-procuring-entity" required>
          </div>
          <div class="form-group">
            <label>Type</label>
            <select id="modal-proc-type">
              <option>Goods</option>
              <option>Works</option>
              <option>Services</option>
              <option>Consultancy</option>
            </select>
          </div>
          <div class="form-group">
            <label>Method</label>
            <select id="modal-method">
              <option>OTM</option>
              <option>LTM</option>
              <option>RFQ</option>
              <option>Direct</option>
            </select>
          </div>
          <div class="form-group">
            <label>Tender Value (BDT)</label>
            <input type="number" id="modal-tender-value">
          </div>
          <div class="form-group">
            <label>Assigned Firm</label>
            ${firmSelect.replace('modal-firm-id', 'modal-assigned-firm-id')}
          </div>
          <div class="form-group">
            <label>Submission Date</label>
            <input type="date" id="modal-lastSubmission">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="discovered">Discovered</option>
              <option value="evaluated">Evaluated</option>
              <option value="preparing">Preparing</option>
              <option value="submitted">Submitted</option>
              <option value="opened">Opened</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>
        </div>
      `,
      project: `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Project Name *</label>
            <input type="text" id="modal-project-name" required>
          </div>
          <div class="form-group">
            <label>Firm *</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Contract Value (BDT) *</label>
            <input type="number" id="modal-contract-value" required>
          </div>
          <div class="form-group">
            <label>Contract Date</label>
            <input type="date" id="modal-contract-date">
          </div>
          <div class="form-group">
            <label>Completion Date</label>
            <input type="date" id="modal-completion-date">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div class="form-group">
            <label>Completion %</label>
            <input type="number" id="modal-completion-percentage" min="0" max="100">
          </div>
        </div>
      `,
      contact: `
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group">
            <label>Firm</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Contact Type</label>
            <select id="modal-contact-type">
              <option value="proprietor">Proprietor</option>
              <option value="partner">Partner</option>
              <option value="director">Director</option>
              <option value="authorized_person">Authorized Person</option>
              <option value="employee">Employee</option>
            </select>
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="modal-designation">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
        </div>
      `,
      'team-member': `
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="modal-designation">
          </div>
          <div class="form-group">
            <label>Department</label>
            <select id="modal-department">
              <option value="">Select...</option>
              <option value="management">Management</option>
              <option value="operations">Operations</option>
              <option value="accounts">Accounts</option>
              <option value="documentation">Documentation</option>
              <option value="field">Field</option>
            </select>
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select id="modal-role" required>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="coordinator">Coordinator</option>
              <option value="accountant">Accountant</option>
              <option value="document_handler">Document Handler</option>
              <option value="field_officer">Field Officer</option>
            </select>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>
          <div class="form-group">
            <label>Joining Date</label>
            <input type="date" id="modal-joining-date">
          </div>
          <div class="form-group full-width">
            <label>Notes</label>
            <textarea id="modal-notes" rows="2"></textarea>
          </div>
        </div>
      `,
      task: `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Task Title *</label>
            <input type="text" id="modal-title" required>
          </div>
          <div class="form-group full-width">
            <label>Description</label>
            <textarea id="modal-description" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>Task Type *</label>
            <select id="modal-task-type" required>
              <option value="tender_preparation">Tender Preparation</option>
              <option value="document_collection">Document Collection</option>
              <option value="bank_work">Bank Work</option>
              <option value="site_visit">Site Visit</option>
              <option value="license_renewal">License Renewal</option>
              <option value="meeting">Meeting</option>
              <option value="payment_followup">Payment Follow-up</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div class="form-group">
            <label>Priority</label>
            <select id="modal-priority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="on_hold">On Hold</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Assigned To</label>
            <select id="modal-assigned-to">
              <option value="">Select Member...</option>
            </select>
          </div>
          <div class="form-group">
            <label>Related Firm</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Due Date</label>
            <input type="date" id="modal-due-date">
          </div>
          <div class="form-group">
            <label>Estimated Hours</label>
            <input type="number" id="modal-estimated-hours" step="0.5">
          </div>
          <div class="form-group full-width">
            <label>Notes</label>
            <textarea id="modal-notes" rows="2"></textarea>
          </div>
        </div>
      `,
      supplier: `
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" id="modal-company-name">
          </div>
          <div class="form-group">
            <label>Supplier Type *</label>
            <select id="modal-supplier-type" required>
              <option value="material">Material Supplier</option>
              <option value="equipment">Equipment Supplier</option>
              <option value="subcontractor">Subcontractor</option>
              <option value="consultant">Consultant</option>
              <option value="service_provider">Service Provider</option>
            </select>
          </div>
          <div class="form-group">
            <label>Category</label>
            <input type="text" id="modal-category" placeholder="cement, steel, electrical, etc.">
          </div>
          <div class="form-group">
            <label>Contact Person</label>
            <input type="text" id="modal-contact-person">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
          <div class="form-group">
            <label>Payment Terms</label>
            <select id="modal-payment-terms">
              <option value="cash">Cash</option>
              <option value="credit_7days">Credit 7 Days</option>
              <option value="credit_15days">Credit 15 Days</option>
              <option value="credit_30days">Credit 30 Days</option>
            </select>
          </div>
          <div class="form-group">
            <label>Credit Limit (BDT)</label>
            <input type="number" id="modal-credit-limit">
          </div>
          <div class="form-group">
            <label>Rating</label>
            <select id="modal-rating">
              <option value="">Select...</option>
              <option value="1">⭐</option>
              <option value="2">⭐⭐</option>
              <option value="3">⭐⭐⭐</option>
              <option value="4">⭐⭐⭐⭐</option>
              <option value="5">⭐⭐⭐⭐⭐</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="blacklisted">Blacklisted</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Address</label>
            <textarea id="modal-address" rows="2"></textarea>
          </div>
        </div>
      `,
      client: `
        <div class="form-grid">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group">
            <label>Organization Type *</label>
            <select id="modal-organization-type" required>
              <option value="government">Government</option>
              <option value="semi_government">Semi-Government</option>
              <option value="private">Private</option>
              <option value="ngo">NGO</option>
              <option value="international">International</option>
            </select>
          </div>
          <div class="form-group">
            <label>Department</label>
            <input type="text" id="modal-department" placeholder="PWD, LGED, RHD, etc.">
          </div>
          <div class="form-group">
            <label>Region</label>
            <select id="modal-region">
              <option value="">Select...</option>
              <option>Dhaka</option>
              <option>Chittagong</option>
              <option>Rajshahi</option>
              <option>Khulna</option>
              <option>Sylhet</option>
              <option>Barisal</option>
              <option>Rangpur</option>
              <option>Mymensingh</option>
            </select>
          </div>
          <div class="form-group">
            <label>Contact Person</label>
            <input type="text" id="modal-contact-person">
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="modal-designation">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
          <div class="form-group">
            <label>Payment Reputation</label>
            <select id="modal-payment-reputation">
              <option value="excellent">Excellent</option>
              <option value="good">Good</option>
              <option value="average">Average</option>
              <option value="poor">Poor</option>
            </select>
          </div>
          <div class="form-group">
            <label>Avg Payment Days</label>
            <input type="number" id="modal-average-payment-days" placeholder="30, 60, 90">
          </div>
          <div class="form-group full-width">
            <label>Office Address</label>
            <textarea id="modal-office-address" rows="2"></textarea>
          </div>
        </div>
      `,
      user: `
        <div class="form-grid">
          <div class="form-group">
            <label>Username *</label>
            <input type="text" id="modal-username" required>
          </div>
          <div class="form-group">
            <label>Password ${currentId ? '(leave blank to keep current)' : '*'}</label>
            <input type="password" id="modal-password" ${currentId ? '' : 'required'}>
          </div>
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" id="modal-full-name">
          </div>
          <div class="form-group">
            <label>Role *</label>
            <select id="modal-role" required>
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" id="modal-email">
          </div>
          <div class="form-group">
            <label>Mobile</label>
            <input type="text" id="modal-mobile">
          </div>
          <div class="form-group">
            <label>Department</label>
            <input type="text" id="modal-department">
          </div>
          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="modal-designation">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Notes</label>
            <textarea id="modal-notes" rows="2"></textarea>
          </div>
        </div>
      `,
      'tender-summary': async () => {
        // Load the comprehensive form from external file
        const response = await fetch('/tender-summary-form.html');
        const formHTML = await response.text();
        return formHTML;
      },
      'letter-category': `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Category Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group full-width">
            <label>Description</label>
            <textarea id="modal-description" rows="2"></textarea>
          </div>
        </div>
      `,
      'letter-template': `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Template Title *</label>
            <input type="text" id="modal-title" required>
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select id="modal-category-id" required></select>
          </div>
          <div class="form-group full-width">
            <label>Description</label>
            <textarea id="modal-description" rows="2"></textarea>
          </div>
          <div class="form-group full-width">
            <label>Template Content *</label>
            <textarea id="modal-content" rows="10" required style="font-family: monospace;"></textarea>
            <small style="color: #666;">Use placeholders: {{company_name}}, {{date}}, {{recipient_name}}, etc.</small>
          </div>
          <div class="form-group full-width">
            <label>Sample Placeholders</label>
            <textarea id="modal-sample-data" rows="3" placeholder='{"company_name": "ABC Corp", "date": "2024-01-15"}'></textarea>
            <small style="color: #666;">JSON format for default placeholder values</small>
          </div>
        </div>
      `,
      'generated-letter': `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Subject *</label>
            <input type="text" id="modal-subject" required>
          </div>
          <div class="form-group">
            <label>Template *</label>
            <select id="modal-template-id" required></select>
          </div>
          <div class="form-group">
            <label>Firm</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Project</label>
            <select id="modal-project-id">
              <option value="">Select Project</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="draft">Draft</option>
              <option value="final">Final</option>
              <option value="sent">Sent</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label>Generated Content *</label>
            <textarea id="modal-content" rows="10" required></textarea>
          </div>
          <div class="form-group full-width">
            <label>Notes</label>
            <textarea id="modal-notes" rows="2"></textarea>
          </div>
        </div>
      `,
      'expense-category': `
        <div class="form-grid">
          <div class="form-group full-width">
            <label>Category Name *</label>
            <input type="text" id="modal-name" required>
          </div>
          <div class="form-group full-width">
            <label>Description</label>
            <textarea id="modal-description" rows="2"></textarea>
          </div>
          <div class="form-group">
            <label>Budget Limit (Optional)</label>
            <input type="number" step="0.01" id="modal-budget-limit" placeholder="0.00">
          </div>
        </div>
      `,
      'expense': `
        <div class="form-grid">
          <div class="form-group">
            <label>Date *</label>
            <input type="date" id="modal-expense-date" required>
          </div>
          <div class="form-group">
            <label>Category *</label>
            <select id="modal-category-id" required></select>
          </div>
          <div class="form-group full-width">
            <label>Description *</label>
            <input type="text" id="modal-description" required>
          </div>
          <div class="form-group">
            <label>Amount *</label>
            <input type="number" step="0.01" id="modal-amount" required>
          </div>
          <div class="form-group">
            <label>Firm</label>
            ${firmSelect}
          </div>
          <div class="form-group">
            <label>Project</label>
            <select id="modal-project-id">
              <option value="">Select Project</option>
            </select>
          </div>
          <div class="form-group">
            <label>Vendor/Supplier</label>
            <input type="text" id="modal-vendor">
          </div>
          <div class="form-group">
            <label>Payment Method</label>
            <select id="modal-payment-method">
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
              <option value="online">Online Payment</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="modal-status">
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div class="form-group">
            <label>Receipt/Invoice #</label>
            <input type="text" id="modal-receipt-number">
          </div>
          <div class="form-group full-width">
            <label>Notes</label>
            <textarea id="modal-notes" rows="2"></textarea>
          </div>
        </div>
      `,
    };

    const formContent = forms[type];
    if (typeof formContent === 'function') {
      return await formContent();
    }
    return formContent || '<p>Form not available</p>';
  },

  async loadItemData(type, id) {
    const endpoints = {
      firm: `/api/firms/${id}`,
      license: `/api/licenses`,
      enlistment: `/api/enlistments`,
      tax: `/api/tax-compliance`,
      account: `/api/bank-accounts`,
      payorder: `/api/pay-orders`,
      guarantee: `/api/bank-guarantees`,
      loan: `/api/loans`,
      tender: `/api/tenders/${id}`,
      project: `/api/projects/${id}`,
      contact: `/api/contacts`,
      'team-member': `/api/team-members/${id}`,
      task: `/api/tasks/${id}`
    };

    try {
      let data;
      if (['firm', 'tender', 'project', 'team-member', 'task'].includes(type)) {
        const response = await fetch(endpoints[type]);
        data = await response.json();
        if (type === 'tender' || type === 'project') data = data[type];
      } else {
        const items = await fetch(endpoints[type]).then(r => r.json());
        data = items.find(item => item.id === id);
      }

      if (data) {
        this.populateForm(data);
      }
    } catch (err) {
      console.error('Load item error:', err);
    }
  },

  populateForm(data) {
    Object.keys(data).forEach(key => {
      const input = document.getElementById(`modal-${key.replace(/_/g, '-')}`);
      if (input) {
        if (input.tagName === 'SELECT' && input.multiple) {
          // Handle multi-select (e.g., category)
          const values = (data[key] || '').split(',').filter(v => v);
          Array.from(input.options).forEach(opt => {
            opt.selected = values.includes(opt.value);
          });
        } else {
          input.value = data[key] || '';
        }
      }
    });
  },

  async populateFirmSelects() {
    const selects = document.querySelectorAll('[id^="modal-"][id$="-firm-id"]');
    selects.forEach(select => {
      select.innerHTML = '<option value="">Select Firm</option>' + 
        currentFirms.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    });
    
    // Populate team member select for tasks
    const teamSelect = document.getElementById('modal-assigned-to');
    if (teamSelect) {
      const teamRes = await fetch(`${API}/team-members?status=active`);
      const teamMembers = await teamRes.json();
      teamSelect.innerHTML = '<option value="">Select Member...</option>' + 
        teamMembers.map(m => `<option value="${m.id}">${m.name} - ${m.designation || m.role}</option>`).join('');
    }
  },

  async saveItem(type, id) {
    const data = this.getFormData(type);
    if (id) data.id = id;

    const endpoints = {
      firm: '/api/firms',
      license: '/api/licenses',
      enlistment: '/api/enlistments',
      tax: '/api/tax-compliance',
      account: '/api/bank-accounts',
      payorder: '/api/pay-orders',
      guarantee: '/api/bank-guarantees',
      loan: '/api/loans',
      tender: '/api/tenders',
      project: '/api/projects',
      contact: '/api/contacts',
      'team-member': '/api/team-members',
      task: '/api/tasks',
      supplier: '/api/suppliers',
      client: '/api/clients',
      user: '/api/users',
      'tender-summary': '/api/tender-summaries',
      'letter-category': '/api/letter-categories',
      'letter-template': '/api/letter-templates',
      'generated-letter': '/api/generated-letters',
      'expense-category': '/api/expense-categories',
      'expense': '/api/expenses'
    };

    try {
      const method = id ? 'PUT' : 'POST';
      const url = id ? `${endpoints[type]}/${id}` : endpoints[type];
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      this.closeModal();
      
      // Refresh the appropriate list
      if (type === 'team-member') this.loadTeamMembers();
      else if (type === 'task') this.loadTasks();
      else if (type === 'supplier') this.loadSuppliers();
      else if (type === 'client') this.loadClients();
      else if (type === 'user') this.loadUsers();
      else if (type === 'tender-summary') this.loadTenderSummaries();
      else this.showPage(type + 's');
      
      alert('Saved successfully!');
    } catch (err) {
      console.error('Save error:', err);
      alert('Error saving data');
    }
  },

  getFormData(type) {
    const getValue = (id) => {
      const el = document.getElementById(`modal-${id}`);
      return el ? el.value : '';
    };
    
    const getMultiSelectValue = (id) => {
      const el = document.getElementById(`modal-${id}`);
      if (!el) return '';
      const selected = Array.from(el.selectedOptions).map(opt => opt.value);
      return selected.join(',');
    };

    const dataMap = {
      firm: () => ({
        name: getValue('name'),
        business_type: getValue('business-type'),
        category: getMultiSelectValue('category'),
        tin: getValue('tin'),
        bin: getValue('bin'),
        address: getValue('address'),
        email: getValue('email'),
        mobile: getValue('mobile'),
        established_date: getValue('established-date'),
        status: 'active'
      }),
      license: () => ({
        firm_id: getValue('firm-id'),
        license_type: getValue('license-type'),
        license_number: getValue('license-number'),
        issuing_authority: getValue('issuing-authority'),
        issue_date: getValue('issue-date'),
        expiry_date: getValue('expiry-date'),
        amount: getValue('amount'),
        status: getValue('status') || 'active'
      }),
      enlistment: () => ({
        firm_id: getValue('firm-id'),
        authority: getValue('authority'),
        category: getValue('category'),
        work_type: getValue('work-type'),
        enlistment_number: getValue('enlistment-number'),
        issue_date: getValue('issue-date'),
        expiry_date: getValue('expiry-date'),
        amount: getValue('amount'),
        status: 'active'
      }),
      tax: () => ({
        firm_id: getValue('firm-id'),
        compliance_type: getValue('compliance-type'),
        fiscal_year: getValue('fiscal-year'),
        month: getValue('month'),
        due_date: getValue('due-date'),
        submission_date: getValue('submission-date'),
        amount: getValue('amount'),
        challan_number: getValue('challan-number'),
        status: 'pending'
      }),
      account: () => ({
        firm_id: getValue('firm-id'),
        bank_name: getValue('bank-name'),
        branch_name: getValue('branch-name'),
        account_number: getValue('account-number'),
        account_type: getValue('account-type'),
        balance: getValue('balance'),
        status: 'active'
      }),
      payorder: () => ({
        firm_id: getValue('firm-id'),
        bank_name: getValue('bank-name'),
        po_number: getValue('po-number'),
        amount: getValue('amount'),
        in_favor_of: getValue('in-favor-of'),
        purpose: getValue('purpose'),
        issue_date: getValue('issue-date'),
        status: getValue('status') || 'active'
      }),
      guarantee: () => ({
        firm_id: getValue('firm-id'),
        bg_type: getValue('bg-type'),
        bank_name: getValue('bank-name'),
        bg_number: getValue('bg-number'),
        amount: getValue('amount'),
        percentage: getValue('percentage'),
        issue_date: getValue('issue-date'),
        expiry_date: getValue('expiry-date'),
        in_favor_of: getValue('in-favor-of'),
        status: 'active'
      }),
      loan: () => ({
        firm_id: getValue('firm-id'),
        bank_name: getValue('bank-name'),
        loan_type: getValue('loan-type'),
        loan_amount: getValue('loan-amount'),
        interest_rate: getValue('interest-rate'),
        tenure_months: getValue('tenure-months'),
        sanction_date: getValue('sanction-date'),
        maturity_date: getValue('maturity-date'),
        outstanding_amount: getValue('loan-amount'),
        status: 'active'
      }),
      tender: () => ({
        tender_id: getValue('tender-id'),
        procuring_entity: getValue('procuring-entity'),
        proc_type: getValue('proc-type'),
        method: getValue('method'),
        tender_value: getValue('tender-value'),
        assigned_firm_id: getValue('assigned-firm-id') || null,
        lastSubmission: getValue('lastSubmission'),
        status: getValue('status') || 'discovered'
      }),
      project: () => ({
        firm_id: getValue('firm-id'),
        project_name: getValue('project-name'),
        contract_value: getValue('contract-value'),
        contract_date: getValue('contract-date'),
        completion_date: getValue('completion-date'),
        completion_percentage: getValue('completion-percentage') || 0,
        status: getValue('status') || 'ongoing',
        total_billed: 0,
        total_received: 0,
        outstanding_amount: 0
      }),
      contact: () => ({
        firm_id: getValue('firm-id') || null,
        name: getValue('name'),
        contact_type: getValue('contact-type'),
        designation: getValue('designation'),
        mobile: getValue('mobile'),
        email: getValue('email')
      }),
      'team-member': () => ({
        name: getValue('name'),
        designation: getValue('designation'),
        department: getValue('department'),
        email: getValue('email'),
        mobile: getValue('mobile'),
        role: getValue('role'),
        status: getValue('status') || 'active',
        joining_date: getValue('joining-date'),
        notes: getValue('notes')
      }),
      task: () => ({
        title: getValue('title'),
        description: getValue('description'),
        task_type: getValue('task-type'),
        priority: getValue('priority') || 'medium',
        status: getValue('status') || 'pending',
        assigned_to: getValue('assigned-to') || null,
        firm_id: getValue('firm-id') || null,
        due_date: getValue('due-date'),
        estimated_hours: getValue('estimated-hours') || null,
        notes: getValue('notes')
      }),
      supplier: () => ({
        name: getValue('name'),
        company_name: getValue('company-name'),
        supplier_type: getValue('supplier-type'),
        category: getValue('category'),
        contact_person: getValue('contact-person'),
        mobile: getValue('mobile'),
        email: getValue('email'),
        address: getValue('address'),
        payment_terms: getValue('payment-terms'),
        credit_limit: getValue('credit-limit'),
        rating: getValue('rating'),
        status: getValue('status') || 'active'
      }),
      client: () => ({
        name: getValue('name'),
        organization_type: getValue('organization-type'),
        department: getValue('department'),
        region: getValue('region'),
        contact_person: getValue('contact-person'),
        designation: getValue('designation'),
        mobile: getValue('mobile'),
        email: getValue('email'),
        office_address: getValue('office-address'),
        payment_reputation: getValue('payment-reputation'),
        average_payment_days: getValue('average-payment-days')
      }),
      user: () => ({
        username: getValue('username'),
        password: getValue('password'),
        full_name: getValue('full-name'),
        email: getValue('email'),
        mobile: getValue('mobile'),
        role: getValue('role'),
        department: getValue('department'),
        designation: getValue('designation'),
        status: getValue('status') || 'active',
        notes: getValue('notes')
      }),
      'tender-summary': () => {
        // Get basic form fields
        const getValue = (id) => {
          const el = document.getElementById(id);
          return el ? el.value : '';
        };
        
        // Collect items from table
        const items = [];
        const itemRows = document.querySelectorAll('#items-tbody tr');
        itemRows.forEach(row => {
          const item = {
            item_no: row.querySelector('.item-no')?.value || '',
            description: row.querySelector('.item-description')?.value || '',
            technical_specification: row.querySelector('.item-specification')?.value || '',
            quantity: row.querySelector('.item-quantity')?.value || '',
            unit: row.querySelector('.item-unit')?.value || '',
            point_of_delivery: row.querySelector('.item-delivery')?.value || '',
            delivery_period: row.querySelector('.item-period')?.value || ''
          };
          if (item.description) items.push(item);
        });
        
        // Collect requirements from table
        const requirements = [];
        const reqRows = document.querySelectorAll('#requirements-tbody tr');
        reqRows.forEach(row => {
          const req = {
            requirement_no: row.querySelector('.req-no')?.value || 0,
            requirement_text: row.querySelector('.req-text')?.value || '',
            is_fulfilled: row.querySelector('.req-fulfilled')?.checked ? 1 : 0
          };
          if (req.requirement_text) requirements.push(req);
        });
        
        return {
          egp_tender_id: getValue('egp_tender_id'),
          procuring_entity: getValue('procuring_entity'),
          official_inviting_tender: getValue('official_inviting_tender'),
          brief_description: getValue('brief_description'),
          invitation_reference: getValue('invitation_reference'),
          invitation_date: getValue('invitation_date'),
          document_price: getValue('document_price'),
          document_purchase_deadline: getValue('document_purchase_deadline'),
          submission_deadline: getValue('submission_deadline'),
          tender_opening_date: getValue('tender_opening_date'),
          procurement_type: getValue('procurement_type'),
          procurement_method: getValue('procurement_method'),
          tender_security_amount: getValue('tender_security_amount'),
          tender_security_in_favour_of: getValue('tender_security_in_favour_of'),
          liquid_asset_requirement: getValue('liquid_asset_requirement'),
          liquid_asset_in_favour_of: getValue('liquid_asset_in_favour_of'),
          inspection_type: getValue('inspection_type'),
          inspection_milestone: getValue('inspection_milestone'),
          inspection_place: getValue('inspection_place'),
          inspection_procedure: getValue('inspection_procedure'),
          estimated_tender_value: getValue('estimated_tender_value'),
          our_estimated_cost: getValue('our_estimated_cost'),
          profit_margin: getValue('profit_margin'),
          materials_cost: getValue('materials_cost'),
          labor_cost: getValue('labor_cost'),
          overhead_cost: getValue('overhead_cost'),
          preparation_days: getValue('preparation_days'),
          execution_days: getValue('execution_days'),
          risk_level: getValue('risk_level'),
          risks: getValue('risks'),
          mitigation_plans: getValue('mitigation_plans'),
          executive_summary: getValue('executive_summary'),
          recommendation: getValue('recommendation'),
          confidence_level: getValue('confidence_level'),
          notes: getValue('notes'),
          firm_id: getValue('firm_id') || null,
          tender_id: getValue('tender_id') || null,
          created_by: 1, // TODO: Get from session
          items: items,
          requirements: requirements
        };
      },
      'letter-category': () => ({
        name: getValue('name'),
        description: getValue('description')
      }),
      'letter-template': () => ({
        title: getValue('title'),
        category_id: getValue('category-id'),
        description: getValue('description'),
        content: getValue('content'),
        sample_data: getValue('sample-data')
      }),
      'generated-letter': () => ({
        subject: getValue('subject'),
        template_id: getValue('template-id'),
        firm_id: getValue('firm-id') || null,
        project_id: getValue('project-id') || null,
        content: getValue('content'),
        status: getValue('status') || 'draft',
        notes: getValue('notes')
      }),
      'expense-category': () => ({
        name: getValue('name'),
        description: getValue('description'),
        budget_limit: getValue('budget-limit') || null
      }),
      'expense': () => ({
        expense_date: getValue('expense-date'),
        description: getValue('description'),
        amount: getValue('amount'),
        category_id: getValue('category-id'),
        firm_id: getValue('firm-id') || null,
        project_id: getValue('project-id') || null,
        vendor: getValue('vendor'),
        payment_method: getValue('payment-method'),
        status: getValue('status') || 'pending',
        receipt_number: getValue('receipt-number'),
        notes: getValue('notes')
      })
    };

    return dataMap[type] ? dataMap[type]() : {};
  },

  async editItem(type, id) {
    this.openModal(type, id);
  },

  async deleteItem(type, id) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    const endpoints = {
      firm: `/api/firms/${id}`,
      license: `/api/licenses/${id}`,
      enlistment: `/api/enlistments/${id}`,
      tax: `/api/tax-compliance/${id}`,
      account: `/api/bank-accounts/${id}`,
      payorder: `/api/pay-orders/${id}`,
      guarantee: `/api/bank-guarantees/${id}`,
      loan: `/api/loans/${id}`,
      tender: `/api/tenders/${id}`,
      project: `/api/projects/${id}`,
      contact: `/api/contacts/${id}`,
      'letter-category': `/api/letter-categories/${id}`,
      'letter-template': `/api/letter-templates/${id}`,
      'generated-letter': `/api/generated-letters/${id}`,
      'expense-category': `/api/expense-categories/${id}`,
      'expense': `/api/expenses/${id}`
    };

    try {
      await fetch(endpoints[type], { method: 'DELETE' });
      this.showPage(type + 's');
      alert('Deleted successfully');
    } catch (err) {
      console.error('Delete error:', err);
      alert('Error deleting item');
    }
  },

  async acknowledgeAlert(id) {
    try {
      await fetch(`${API}/alerts/${id}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'acknowledged' })
      });
      this.loadAllAlerts();
    } catch (err) {
      console.error('Alert acknowledge error:', err);
    }
  },

  // ============================================
  // TEAM MEMBERS
  // ============================================
  async loadTeamMembers() {
    const res = await fetch(`${API}/team-members`);
    const members = await res.json();
    
    const html = members.map(m => `
      <tr>
        <td>${m.name}</td>
        <td>${m.designation || '-'}</td>
        <td>${m.department || '-'}</td>
        <td><span class="badge badge-info">${m.role}</span></td>
        <td>${m.mobile || '-'}</td>
        <td>${m.email || '-'}</td>
        <td><span class="badge badge-${m.status === 'active' ? 'success' : m.status === 'on_leave' ? 'warning' : 'secondary'}">${m.status}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editTeamMember(${m.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteTeamMember(${m.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('team-list').innerHTML = html || '<tr><td colspan="8" style="text-align:center">No team members</td></tr>';
  },

  async editTeamMember(id) {
    const res = await fetch(`${API}/team-members/${id}`);
    const member = await res.json();
    currentId = id;
    
    this.openModal('team-member', member);
  },

  async deleteTeamMember(id) {
    if (!confirm('Delete this team member?')) return;
    await fetch(`${API}/team-members/${id}`, { method: 'DELETE' });
    this.loadTeamMembers();
  },

  // ============================================
  // TASKS
  // ============================================
  async loadTasks() {
    const status = document.getElementById('task-status-filter').value;
    const priority = document.getElementById('task-priority-filter').value;
    const assigned_to = document.getElementById('task-assigned-filter').value;
    
    let url = `${API}/tasks?`;
    if (status) url += `status=${status}&`;
    if (priority) url += `priority=${priority}&`;
    if (assigned_to) url += `assigned_to=${assigned_to}&`;
    
    const res = await fetch(url);
    const tasks = await res.json();
    
    const html = tasks.map(t => {
      const isOverdue = t.due_date && new Date(t.due_date) < new Date() && !['completed', 'cancelled'].includes(t.status);
      return `
        <tr ${isOverdue ? 'style="background:#fff3f3"' : ''}>
          <td>
            <strong>${t.title}</strong>
            ${t.description ? `<br><small style="color:#666">${t.description.substring(0,60)}...</small>` : ''}
          </td>
          <td><span class="badge badge-secondary">${t.task_type}</span></td>
          <td><span class="badge badge-${t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'info'}">${t.priority}</span></td>
          <td><span class="badge badge-${this.getStatusColor(t.status)}">${t.status}</span></td>
          <td>${t.assigned_to_name || '-'}</td>
          <td>${t.due_date || '-'} ${isOverdue ? '<br><span class="badge badge-danger">Overdue</span>' : ''}</td>
          <td>${t.firm_name || t.tender_no || t.project_name || '-'}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="app.editTask(${t.id})">Edit</button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteTask(${t.id})">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
    
    document.getElementById('tasks-list').innerHTML = html || '<tr><td colspan="8" style="text-align:center">No tasks</td></tr>';
    
    // Populate team member filter
    const teamRes = await fetch(`${API}/team-members?status=active`);
    const teamMembers = await teamRes.json();
    const filterSelect = document.getElementById('task-assigned-filter');
    const currentValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Members</option>' + 
      teamMembers.map(m => `<option value="${m.id}" ${m.id == currentValue ? 'selected' : ''}>${m.name}</option>`).join('');
  },

  async editTask(id) {
    const res = await fetch(`${API}/tasks/${id}`);
    const task = await res.json();
    currentId = id;
    
    this.openModal('task', task);
  },

  async deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
    this.loadTasks();
  },

  // ============================================
  // SUPPLIERS
  // ============================================
  async loadSuppliers() {
    const res = await fetch(`${API}/suppliers`);
    const suppliers = await res.json();
    
    const html = suppliers.map(s => `
      <tr>
        <td>${s.name}${s.company_name ? `<br><small>${s.company_name}</small>` : ''}</td>
        <td><span class="badge badge-secondary">${s.supplier_type}</span></td>
        <td>${s.category || '-'}</td>
        <td>${s.contact_person || '-'}</td>
        <td>${s.mobile || '-'}</td>
        <td>৳${this.formatNumber(s.current_due || 0)}</td>
        <td>${s.rating ? '⭐'.repeat(s.rating) : '-'}</td>
        <td><span class="badge badge-${s.status === 'active' ? 'success' : s.status === 'blacklisted' ? 'danger' : 'secondary'}">${s.status}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editSupplier(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteSupplier(${s.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('suppliers-list').innerHTML = html || '<tr><td colspan="9" style="text-align:center">No suppliers</td></tr>';
  },

  async editSupplier(id) {
    const res = await fetch(`${API}/suppliers/${id}`);
    const supplier = await res.json();
    currentId = id;
    this.openModal('supplier', supplier);
  },

  async deleteSupplier(id) {
    if (!confirm('Delete this supplier?')) return;
    await fetch(`${API}/suppliers/${id}`, { method: 'DELETE' });
    this.loadSuppliers();
  },

  // ============================================
  // CLIENTS
  // ============================================
  async loadClients() {
    const res = await fetch(`${API}/clients`);
    const clients = await res.json();
    
    const html = clients.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><span class="badge badge-info">${c.organization_type}</span></td>
        <td>${c.department || '-'}</td>
        <td>${c.contact_person || '-'}</td>
        <td>${c.mobile || '-'}</td>
        <td>${c.region || '-'}</td>
        <td><span class="badge badge-${c.payment_reputation === 'excellent' ? 'success' : c.payment_reputation === 'good' ? 'info' : 'warning'}">${c.payment_reputation || '-'}</span></td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editClient(${c.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteClient(${c.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('clients-list').innerHTML = html || '<tr><td colspan="8" style="text-align:center">No clients</td></tr>';
  },

  async editClient(id) {
    const res = await fetch(`${API}/clients/${id}`);
    const client = await res.json();
    currentId = id;
    this.openModal('client', client);
  },

  async deleteClient(id) {
    if (!confirm('Delete this client?')) return;
    await fetch(`${API}/clients/${id}`, { method: 'DELETE' });
    this.loadClients();
  },

  // ============================================
  // USERS
  // ============================================
  async loadUsers() {
    const res = await fetch(`${API}/users`);
    const users = await res.json();
    
    const html = users.map(u => `
      <tr>
        <td>${u.username}</td>
        <td>${u.full_name || '-'}</td>
        <td><span class="badge badge-${u.role === 'admin' ? 'danger' : u.role === 'manager' ? 'warning' : 'info'}">${u.role}</span></td>
        <td>${u.department || '-'}</td>
        <td>${u.email || '-'}</td>
        <td>${u.mobile || '-'}</td>
        <td><span class="badge badge-${u.status === 'active' ? 'success' : 'secondary'}">${u.status}</span></td>
        <td>${u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editUser(${u.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteUser(${u.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('users-list').innerHTML = html || '<tr><td colspan="9" style="text-align:center">No users</td></tr>';
  },

  async editUser(id) {
    const res = await fetch(`${API}/users/${id}`);
    const user = await res.json();
    currentId = id;
    this.openModal('user', user);
  },

  async deleteUser(id) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await fetch(`${API}/users/${id}`, { method: 'DELETE' });
    this.loadUsers();
  },

  // ============================================
  // TENDER SUMMARIES
  // ============================================
  
  async populateTenderSummaryDropdowns() {
    // Populate firm dropdown
    const firmSelect = document.getElementById('firm_id');
    if (firmSelect) {
      firmSelect.innerHTML = '<option value="">Select Firm (Optional)</option>' + 
        currentFirms.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
    }
    
    // Populate tender dropdown
    const tenderSelect = document.getElementById('tender_id');
    if (tenderSelect) {
      try {
        const res = await fetch(`${API}/tenders`);
        const tenders = await res.json();
        tenderSelect.innerHTML = '<option value="">Select Tender (Optional)</option>' + 
          tenders.map(t => `<option value="${t.id}">${t.tender_id} - ${t.procuring_entity}</option>`).join('');
      } catch (err) {
        console.error('Error loading tenders:', err);
      }
    }
  },
  
  async loadTenderSummaries() {
    const res = await fetch(`${API}/tender-summaries`);
    const summaries = await res.json();
    
    const html = summaries.map(s => `
      <tr>
        <td>${s.egp_tender_id || '-'}</td>
        <td>${s.procuring_entity || '-'}</td>
        <td>${s.firm_name || '-'}</td>
        <td>৳${this.formatNumber(s.estimated_tender_value || 0)}</td>
        <td><span class="badge badge-${s.recommendation === 'should_participate' ? 'success' : s.recommendation === 'risky' ? 'warning' : 'danger'}">${s.recommendation || '-'}</span></td>
        <td><span class="badge badge-${s.confidence_level === 'high' ? 'success' : s.confidence_level === 'medium' ? 'warning' : 'secondary'}">${s.confidence_level || '-'}</span></td>
        <td>${s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}</td>
        <td>
          <button class="btn btn-sm btn-info" onclick="app.viewSummary(${s.id})">View</button>
          <button class="btn btn-sm btn-secondary" onclick="app.editSummary(${s.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteSummary(${s.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('tender-summaries-list').innerHTML = html || '<tr><td colspan="8" style="text-align:center">No tender summaries</td></tr>';
  },

  async viewSummary(id) {
    const res = await fetch(`${API}/tender-summaries/${id}`);
    const summary = await res.json();
    // TODO: Open a detailed view modal or navigate to a detail page
    alert('View functionality coming soon!\n\nSummary for: ' + summary.project_title);
  },

  async editSummary(id) {
    const res = await fetch(`${API}/tender-summaries/${id}`);
    const summary = await res.json();
    currentId = id;
    this.openModal('tender-summary', summary);
  },

  async deleteSummary(id) {
    if (!confirm('Delete this tender summary?')) return;
    await fetch(`${API}/tender-summaries/${id}`, { method: 'DELETE' });
    this.loadTenderSummaries();
  },

  formatNumber(num) {
    if (!num) return '0';
    return parseFloat(num).toLocaleString('en-IN');
  },

  formatLicenseType(type) {
    const typeMap = {
      'trade_license': 'Trade License',
      'tin': 'TIN',
      'vat': 'VAT',
      'irc': 'IRC',
      'fire': 'Fire License',
      'environmental': 'Environmental License'
    };
    return typeMap[type] || type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  },

  animateValue(id, start, end, duration) {
    const element = document.getElementById(id);
    if (!element) return;
    
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.floor(start + (end - start) * progress);
      element.textContent = value;
      
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };
    requestAnimationFrame(update);
  },

  searchFirms() {
    const searchTerm = document.getElementById('firms-search')?.value.toLowerCase() || '';
    const rows = document.querySelectorAll('#firms-list tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
  },

  searchTenders() {
    const searchTerm = document.getElementById('tenders-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('tender-status-search')?.value || '';
    const rows = document.querySelectorAll('#tenders-list tr');
    
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      const matchesSearch = text.includes(searchTerm);
      const matchesStatus = !statusFilter || text.includes(statusFilter.toLowerCase());
      row.style.display = (matchesSearch && matchesStatus) ? '' : 'none';
    });
  },

  exportFirmsToCSV() {
    const data = currentFirms.map(f => ({
      'Firm Name': f.name,
      'Business Type': f.business_type || '',
      'Category': f.category || '',
      'TIN': f.tin || '',
      'Contact': f.mobile || f.phone || '',
      'Status': f.status
    }));
    this.downloadCSV(data, 'firms_export.csv');
  },

  exportTendersToCSV() {
    fetch(`${API}/tenders`).then(r => r.json()).then(tenders => {
      const data = tenders.map(t => ({
        'Tender ID': t.tender_id,
        'Procuring Entity': t.procuring_entity,
        'Type': t.proc_type,
        'Value': t.tender_value || '',
        'Status': t.status,
        'Submission Date': t.lastSubmission || ''
      }));
      this.downloadCSV(data, 'tenders_export.csv');
    });
  },

  // Letter Hub Management
  async loadLetters() {
    await Promise.all([
      this.loadLetterCategories(),
      this.loadLetterTemplates(),
      this.loadGeneratedLetters()
    ]);
  },

  async loadLetterCategories() {
    const res = await fetch(`${API}/letter-categories`);
    const categories = await res.json();
    
    const html = categories.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.description || '-'}</td>
        <td>${c.template_count || 0}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editItem('letter-category', ${c.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteItem('letter-category', ${c.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('letter-categories-list').innerHTML = html || '<tr><td colspan="4">No categories found</td></tr>';
  },

  async loadLetterTemplates() {
    const res = await fetch(`${API}/letter-templates`);
    const templates = await res.json();
    
    const html = templates.map(t => `
      <tr>
        <td>${t.title}</td>
        <td>${t.category_name || '-'}</td>
        <td>${t.description || '-'}</td>
        <td>${t.usage_count || 0}</td>
        <td>${new Date(t.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-info" onclick="app.viewTemplate(${t.id})">View</button>
          <button class="btn btn-sm btn-secondary" onclick="app.editItem('letter-template', ${t.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteItem('letter-template', ${t.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('letter-templates-list').innerHTML = html || '<tr><td colspan="6">No templates found</td></tr>';
    
    // Populate category dropdown in template form
    const categorySelect = document.getElementById('modal-category-id');
    if (categorySelect) {
      const catRes = await fetch(`${API}/letter-categories`);
      const cats = await catRes.json();
      categorySelect.innerHTML = '<option value="">Select Category</option>' + 
        cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  },

  async loadGeneratedLetters() {
    const firmFilter = this.getUserFirmFilter();
    const url = firmFilter ? `${API}/generated-letters?firm_id=${firmFilter}` : `${API}/generated-letters`;
    const res = await fetch(url);
    const letters = await res.json();
    
    const html = letters.map(l => `
      <tr>
        <td>${l.subject}</td>
        <td>${l.template_title || '-'}</td>
        <td>${l.firm_name || '-'}</td>
        <td>${l.project_name || '-'}</td>
        <td><span class="badge badge-${l.status === 'sent' ? 'success' : l.status === 'final' ? 'info' : 'secondary'}">${l.status}</span></td>
        <td>${new Date(l.generated_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-sm btn-info" onclick="app.viewLetter(${l.id})">View</button>
          <button class="btn btn-sm btn-secondary" onclick="app.editItem('generated-letter', ${l.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteItem('generated-letter', ${l.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('generated-letters-list').innerHTML = html || '<tr><td colspan="7">No letters generated</td></tr>';
  },

  async viewTemplate(id) {
    const res = await fetch(`${API}/letter-templates/${id}`);
    const template = await res.json();
    alert(`Title: ${template.title}\n\nContent:\n${template.content}`);
  },

  async viewLetter(id) {
    const res = await fetch(`${API}/generated-letters/${id}`);
    const letter = await res.json();
    alert(`Subject: ${letter.subject}\n\nContent:\n${letter.content}`);
  },

  // Expense Manager
  async loadExpenses() {
    await Promise.all([
      this.loadExpenseStats(),
      this.loadExpenseCategories(),
      this.loadExpensesList()
    ]);
  },

  async loadExpenseStats() {
    const res = await fetch(`${API}/expenses/statistics/summary`);
    const stats = await res.json();
    
    const html = `
      <div style="padding: 15px; background: #e3f2fd; border-radius: 8px; text-align: center;">
        <h4 style="margin: 0;">Total Expenses</h4>
        <h2 style="margin: 5px 0; color: #1976d2;">৳${this.formatNumber(stats.total_amount || 0)}</h2>
        <p style="margin: 0; color: #666;">${stats.total_count || 0} transactions</p>
      </div>
      <div style="padding: 15px; background: #fff3e0; border-radius: 8px; text-align: center;">
        <h4 style="margin: 0;">Pending</h4>
        <h2 style="margin: 5px 0; color: #f57c00;">৳${this.formatNumber(stats.pending_amount || 0)}</h2>
        <p style="margin: 0; color: #666;">${stats.pending_count || 0} items</p>
      </div>
      <div style="padding: 15px; background: #e8f5e9; border-radius: 8px; text-align: center;">
        <h4 style="margin: 0;">Approved</h4>
        <h2 style="margin: 5px 0; color: #388e3c;">৳${this.formatNumber(stats.approved_amount || 0)}</h2>
        <p style="margin: 0; color: #666;">${stats.approved_count || 0} items</p>
      </div>
      <div style="padding: 15px; background: #f3e5f5; border-radius: 8px; text-align: center;">
        <h4 style="margin: 0;">Paid</h4>
        <h2 style="margin: 5px 0; color: #7b1fa2;">৳${this.formatNumber(stats.paid_amount || 0)}</h2>
        <p style="margin: 0; color: #666;">${stats.paid_count || 0} items</p>
      </div>
    `;
    
    document.getElementById('expense-stats').innerHTML = html;
  },

  async loadExpenseCategories() {
    const res = await fetch(`${API}/expense-categories`);
    const categories = await res.json();
    
    const html = categories.map(c => `
      <tr>
        <td>${c.name}</td>
        <td>${c.description || '-'}</td>
        <td>${c.budget_limit ? '৳' + this.formatNumber(c.budget_limit) : 'No limit'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editItem('expense-category', ${c.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteItem('expense-category', ${c.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('expense-categories-list').innerHTML = html || '<tr><td colspan="4">No categories found</td></tr>';
    
    // Populate category filters and form dropdown
    const filterSelect = document.getElementById('expense-category-filter');
    if (filterSelect) {
      filterSelect.innerHTML = '<option value="">All Categories</option>' + 
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    const categorySelect = document.getElementById('modal-category-id');
    if (categorySelect) {
      categorySelect.innerHTML = '<option value="">Select Category</option>' + 
        categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  },

  async loadExpensesList() {
    const firmFilter = this.getUserFirmFilter();
    const statusFilter = document.getElementById('expense-status-filter')?.value || '';
    const categoryFilter = document.getElementById('expense-category-filter')?.value || '';
    
    let url = `${API}/expenses?`;
    if (firmFilter) url += `firm_id=${firmFilter}&`;
    if (statusFilter) url += `status=${statusFilter}&`;
    if (categoryFilter) url += `category_id=${categoryFilter}&`;
    
    const res = await fetch(url);
    const expenses = await res.json();
    
    const html = expenses.map(e => `
      <tr>
        <td>${new Date(e.expense_date).toLocaleDateString()}</td>
        <td>${e.description}</td>
        <td>${e.category_name || '-'}</td>
        <td>${e.firm_name || '-'}</td>
        <td>${e.project_name || '-'}</td>
        <td>৳${this.formatNumber(e.amount)}</td>
        <td><span class="badge badge-${this.getStatusColor(e.status)}">${e.status}</span></td>
        <td>${e.vendor || '-'}</td>
        <td>
          <button class="btn btn-sm btn-secondary" onclick="app.editItem('expense', ${e.id})">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="app.deleteItem('expense', ${e.id})">Delete</button>
        </td>
      </tr>
    `).join('');
    
    document.getElementById('expenses-list').innerHTML = html || '<tr><td colspan="9">No expenses found</td></tr>';
  },

  downloadCSV(data, filename) {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }
    
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
    ].join('\\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
  },

  getStatusColor(status) {
    const colors = {
      active: 'success',
      pending: 'warning',
      paid: 'success',
      submitted: 'info',
      overdue: 'danger',
      expired: 'danger',
      discovered: 'info',
      preparing: 'warning',
      won: 'success',
      lost: 'danger',
      ongoing: 'warning',
      completed: 'success',
      encashed: 'secondary',
      cancelled: 'danger',
      in_progress: 'info',
      on_hold: 'warning'
    };
    return colors[status] || 'secondary';
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => app.init());
