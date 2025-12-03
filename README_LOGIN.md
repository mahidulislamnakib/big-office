# Big Office - Login System

## Access Flow

### 1. **Login Page** (`/login.html` or root `/`)
- Clean, modern login interface
- Demo credentials provided on the page:
  - **Admin**: `admin` / `demo123`
  - **Manager**: `manager` / `demo123`
  - **Accounts**: `accounts` / `demo123`

### 2. **Home Page** (`/home.html`)
- Beautiful landing page with:
  - Hero section with welcome message
  - Feature cards showcasing system capabilities
  - Live statistics (firms, tenders, projects, team members)
  - Quick access links to all modules
  - User info and logout button in navigation
  
### 3. **Dashboard** (`/app.html`)
- Full application dashboard with:
  - Smooth scrolling navigation
  - Sticky sidebar with all modules
  - User avatar and name in top bar
  - Home button to return to landing page
  - Logout button with confirmation
  - Deep linking support (e.g., `/app.html#tenders`)

## Features Implemented

### ✅ **Smooth Scrolling**
- HTML scroll-behavior: smooth
- Animated page transitions (fadeIn)
- Custom scrollbar styling
- Sticky navigation bars

### ✅ **Better Navigation**
- Top bar with logo (clickable to home)
- User info display (avatar + name)
- Home button in dashboard
- Sidebar hover effects with smooth transitions
- Menu items slide animation on hover
- Deep linking with hash navigation

### ✅ **Authentication**
- Login page with validation
- LocalStorage session management
- Protected routes (redirect to login if not authenticated)
- User info persisted across pages
- Logout with confirmation dialog

### ✅ **Professional UI/UX**
- Gradient backgrounds
- Card-based layouts
- Hover animations and transitions
- Responsive grid layouts
- Status badges with color coding
- Empty states and loading indicators

## Navigation Structure

```
/ (root)
├── login.html ────────────► Login Page
│                             ↓ (after login)
├── home.html ─────────────► Home/Landing Page
│                             ↓ (go to dashboard)
└── app.html ──────────────► Full Dashboard
    ├── Dashboard
    ├── Firms Management
    │   ├── Firms
    │   ├── Licenses
    │   ├── Enlistments
    │   └── Tax Compliance
    ├── Banking & Finance
    │   ├── Bank Accounts
    │   ├── Pay Orders
    │   ├── Bank Guarantees
    │   └── Loans
    ├── Operations
    │   ├── Tenders
    │   ├── Projects
    │   └── Tender Summaries
    ├── Contacts & Relations
    │   ├── Suppliers
    │   └── Clients
    └── Team & Tasks
        ├── Team Members
        ├── Tasks
        ├── Users & Admin
        └── Alerts
```

## Technical Details

### Authentication Flow
1. User enters credentials on `/login.html`
2. POST request to `/api/login` endpoint
3. Server validates against `users` table
4. Returns user object (excluding password)
5. Frontend stores user in `localStorage`
6. Redirects to `/home.html`
7. All subsequent pages check `localStorage` for auth

### Session Storage
```javascript
localStorage.setItem('isLoggedIn', 'true');
localStorage.setItem('user', JSON.stringify(userData));
```

### Protected Routes
Each page includes:
```javascript
if (localStorage.getItem('isLoggedIn') !== 'true') {
  window.location.href = '/login.html';
}
```

## Smooth Scrolling Implementation

### CSS
```css
html {
  scroll-behavior: smooth;
}

.main-content {
  animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

### JavaScript
- Scroll-based navbar effects
- Smooth anchor link scrolling
- Page transition animations

## URLs

- **Root**: http://localhost:3000/ → Redirects to login
- **Login**: http://localhost:3000/login.html
- **Home**: http://localhost:3000/home.html
- **Dashboard**: http://localhost:3000/app.html
- **Deep Link**: http://localhost:3000/app.html#tenders

## Demo Credentials

All demo users have password: `demo123`

| Username | Role | Access Level |
|----------|------|--------------|
| admin | Administrator | Full access to all modules |
| manager | Manager | Management and oversight |
| accounts | Accountant | Financial modules focus |

---

**Start the application**: `npm start`
**Access**: http://localhost:3000/
