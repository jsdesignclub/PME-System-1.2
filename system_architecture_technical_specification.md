# Provincial Ministry Enterprise Management System (ERP)

## End-to-End Technical Architecture & System Specification (Web-First Edition)

## 1. Executive Summary & Domain Context

The **Provincial Ministry Enterprise System** is a unified, multi-tenant administrative portal designed specifically for Sri Lankan provincial ministries and government bodies. Government administrative operations depend heavily on physical paper correspondence, official day stamps (*දින මුද්‍රාව*), executive directives (*"Minutes" / සටහන්*), formal duty charts (*කාර්ය පත්‍රිකාව*), asset allocations, and strict hierarchical approval chains.

This specification provides a complete architectural blueprint. **Phase 1** focuses strictly on the **Web Application Architecture** (Desktop-first for Ministry Secretaries, Administrative Officers, Subject Clerks, and Front Desk Staff) and the core **Node.js Express + MySQL Backend Architecture**. **Phase 2** details the **React Native Mobile Architecture** for executive officers on the move.

---

## 2. System Domain Glossary

| Term | Domain Meaning | Technical Representation |
| :--- | :--- | :--- |
| **Day Stamp (දින මුද්‍රාව)** | Unique registry sequence number stamped on incoming physical letters at the front office upon arrival. | `day_stamp_no` (indexed string, e.g., `DS/2026/09/0441`) |
| **Minutes (සටහන්/මිනිත්තු)** | Formal handwritten or digital directives endorsed by high-level executives (Secretary, AO) instructing action officers. | `official_minutes` relational table with author metadata |
| **Subject Clerk (විෂය භාර නිළදාරී/Subject Clark)** | Administrative clerk responsible for classifying incoming correspondence and routing it to technical officers based on duty charts. | `role = 'SUBJECT_CLERK'` |
| **Action Officer** | Senior or technical official (e.g., Legal Officer, Director Works, Senior Asst. Secretary) executing the directive. | `role = 'OFFICER'` linked via `assigned_officer_id` |
| **Duty List (කාර්ය පත්‍රිකාව)** | The official, legally mandated roster mapping specific administrative duties/keywords to specific officers. | Table `officer_duties` and `duty_keywords` |

---

## 3. High-Level Architectural Pattern

The platform utilizes a **Modular Monolith Architecture** with a Web-First client interface, backed by a Node.js Express REST API and a MySQL relational database.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    WEB CLIENT LAYER (Phase 1)                           │
│     React.js Web Single Page Application (Vite + Tailwind CSS)          │
│     Desktop-First UI │ Print Engine │ Day Stamp Scanner Integration    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     │ Secure HTTPS / REST API / JWT
                                     │
┌────────────────────────────────────┴────────────────────────────────────┐
│                    MOBILE CLIENT LAYER (Phase 2)                        │
│             React Native Application (Expo / Cross-Platform)             │
│      Executive Minutes │ Field Status Updates │ Push Notifications       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    GATEWAY & AUTHENTICATION LAYER                       │
│      Express.js Router  │ JWT Auth Middleware │ Role Middleware         │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  MAIL & MINUTES  │        │ VEHICLE BOOKING  │        │ ASSETS & STAFF   │
│     MODULE       │        │     MODULE       │        │ TRANSFERS MODULE │
└────────┬─────────┘        └────────┬─────────┘        └────────┬─────────┘
         │                           │                           │
         └───────────────────────────┼───────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER (MySQL 8.0+)                         │
│   Core Shared Tables (Users, Depts) │ Module Specific Tables & Indexes   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Role-Based Access Control (RBAC) & User Personas

### 4.1 Persona Matrix

1. **Minor Staff / Front Desk Clerk (`MINOR_STAFF`):**
   * **Primary Responsibility:** Log incoming physical letters, issue Day Stamp numbers, scan and upload PDF/image attachments.
   * **Permissions:** `CREATE_MAIL`, `READ_PUBLIC_MAIL`.

2. **Higher Authority / Executive (`SECRETARY`, `AO`, `CHIEF_CLERK`):**
   * **Primary Responsibility:** Review unreviewed incoming mail, write executive minutes/instructions, select preset action directives, approve resource requests.
   * **Permissions:** `READ_ALL_MAIL`, `WRITE_MINUTES`, `FORWARD_MAIL`, `APPROVE_VEHICLE`, `APPROVE_TRANSFER`.

3. **Subject Clerk (`SUBJECT_CLERK`):**
   * **Primary Responsibility:** Review executive minutes, run duty matching against official duty charts, route letters to action officers, update status.
   * **Permissions:** `READ_DEPARTMENT_MAIL`, `ASSIGN_OFFICER`, `UPDATE_DUTY_CHART`.

4. **Action / Duty Officer (`OFFICER`, `ENGINEER`, `LEGAL_OFFICER`):**
   * **Primary Responsibility:** Perform tasks detailed in minutes, submit progress reports, upload clearance certificates, mark letters completed.
   * **Permissions:** `READ_ASSIGNED_MAIL`, `UPDATE_ACTION_STATUS`, `CLOSE_MAIL_FILE`.

5. **System Administrator (`ADMIN`):**
   * **Primary Responsibility:** User lifecycle management, database backups, audit logging, duty chart maintenance.
   * **Permissions:** `FULL_SYSTEM_ACCESS`.

---

## 5. Entity-Relationship & Database Schema Design (MySQL 8.0+)

### 5.1 Shared Core Schema

```sql
-- Shared Departments / Sections
CREATE TABLE IF NOT EXISTS departments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Shared Users Table (Authentication & Hierarchy)
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nic_no VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('ADMIN', 'SECRETARY', 'AO', 'CHIEF_CLERK', 'SUBJECT_CLERK', 'OFFICER', 'MINOR_STAFF', 'TRANSPORT_OFFICER') NOT NULL,
    department_id INT,
    designation VARCHAR(150) NOT NULL,
    section_name VARCHAR(150),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    INDEX idx_user_role (role),
    INDEX idx_user_nic (nic_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 5.2 Mail & Minutes Management Schema

```sql
-- Mail Registry
CREATE TABLE IF NOT EXISTS mail_records (
    id VARCHAR(36) PRIMARY KEY, -- UUID or System LTR Code
    day_stamp_no VARCHAR(50) UNIQUE NOT NULL,
    letter_ref_no VARCHAR(100),
    receipt_date DATE NOT NULL,
    sender_type ENUM('Government Office', 'Non-Government / Public', 'Private Organization', 'Judicial / Court') NOT NULL,
    sender_name VARCHAR(200) NOT NULL,
    subject TEXT NOT NULL,
    priority ENUM('Normal', 'Urgent', 'Confidential') DEFAULT 'Normal',
    category VARCHAR(100) DEFAULT 'General Administration',
    has_attachment BOOLEAN DEFAULT FALSE,
    attachment_path VARCHAR(255),
    status ENUM('Logged', 'Forwarded to Subject', 'Assigned', 'In Progress', 'Completed') DEFAULT 'Logged',
    assigned_officer_id INT DEFAULT NULL,
    assigned_date DATETIME DEFAULT NULL,
    subject_clerk_note TEXT,
    officer_status_note TEXT,
    completion_date DATETIME DEFAULT NULL,
    created_by_user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_officer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id),
    INDEX idx_day_stamp (day_stamp_no),
    INDEX idx_status (status),
    INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Official Executive Minutes History
CREATE TABLE IF NOT EXISTS official_minutes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mail_record_id VARCHAR(36) NOT NULL,
    author_user_id INT NOT NULL,
    author_role VARCHAR(50) NOT NULL,
    author_name VARCHAR(150) NOT NULL,
    instruction_type VARCHAR(100) NOT NULL, -- e.g., 'For Immediate Report', 'Prepare Draft Reply'
    minutes_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (mail_record_id) REFERENCES mail_records(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Official Duty Charts for Automated Matching
CREATE TABLE IF NOT EXISTS officer_duties (
    id INT AUTO_INCREMENT PRIMARY KEY,
    officer_user_id INT NOT NULL,
    section_name VARCHAR(150) NOT NULL,
    duty_description TEXT NOT NULL,
    keywords JSON NOT NULL, -- e.g. ["tender", "procurement", "budget", "finance"]
    FOREIGN KEY (officer_user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. End-to-End Mail Workflow State Machine

```
   [Physical Letter Arrives at Front Office]
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 1. LOGGED (Minor Staff)              │ ─── Day Stamp Assigned, PDF Attachment Uploaded
   └──────────────────┬───────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 2. REVIEWED (Secretary / AO)         │ ─── Digital Minutes Written & Endorsed
   └──────────────────┬───────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 3. FORWARDED TO SUBJECT CLERK        │ ─── Subject Clerk Classifies & Duty Matches
   └──────────────────┬───────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 4. ASSIGNED TO ACTION OFFICER        │ ─── Routed to Specific Action Officer
   └──────────────────┬───────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 5. IN PROGRESS (Action Officer)      │ ─── Investigation conducted / Draft prepared
   └──────────────────┬───────────────────┘
                      │
                      ▼
   ┌──────────────────────────────────────┐
   │ 6. COMPLETED & ARCHIVED              │ ─── Final Response Sent, Printable Minute Slip Generated
   └──────────────────────────────────────┘
```

---

## 7. Core REST API Interface Specifications

### 7.1 Authentication Endpoints

#### `POST /api/v1/auth/login`
* **Request:**
  ```json
  {
    "nic_no": "881234567V",
    "password": "SecretPassword123"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 12,
      "full_name": "Dr. A. B. Herath",
      "role": "SECRETARY",
      "designation": "Provincial Secretary",
      "department_id": 1
    }
  }
  ```

### 7.2 Mail Operations Endpoints

#### `POST /api/v1/mail`
* **Headers:** `Authorization: Bearer <token>`
* **Request:**
  ```json
  {
    "day_stamp_no": "DS/2026/09/0441",
    "letter_ref_no": "NPC/EDU/FIN/2026/102",
    "receipt_date": "2026-09-26",
    "sender_type": "Government Office",
    "sender_name": "Provincial Department of Education",
    "subject": "Request for Urgent Budget Allocation for School Furniture Procurement",
    "priority": "Urgent",
    "category": "Finance & Supply",
    "attachment_name": "Furniture_Budget.pdf"
  }
  ```
* **Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Mail record logged successfully.",
    "record_id": "LTR-2026-0891"
  }
  ```

#### `POST /api/v1/mail/:id/minutes`
* **Headers:** `Authorization: Bearer <token>`
* **Request:**
  ```json
  {
    "author_role": "Secretary",
    "author_name": "Dr. A. B. Herath",
    "instruction_type": "For Immediate Report",
    "minutes_text": "Verify budget availability with Treasury guidelines."
  }
  ```
* **Response (200 OK):** Updates letter status to `Forwarded to Subject` and appends to `official_minutes`.

---

## 8. Automated Duty Matching Algorithm

When a Subject Clerk inspects a letter on the web dashboard, the system runs a tokenization and keyword-scoring match algorithm against active officer duty rosters.

```javascript
function suggestOfficerForLetter(letterSubject, officersList) {
  const normalizedSubject = letterSubject.toLowerCase();
  let bestMatch = null;
  let highestScore = 0;

  for (const officer of officersList) {
    let score = 0;

    // Direct Keyword Match (Weight = 2)
    for (const keyword of officer.keywords) {
      if (normalizedSubject.includes(keyword.toLowerCase())) {
        score += 2;
      }
    }

    // Duty Description Token Match (Weight = 1)
    for (const dutySentence of officer.duties) {
      const words = dutySentence.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && normalizedSubject.includes(word)) {
          score += 1;
        }
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = officer;
    }
  }

  return bestMatch;
}
```

---

## 9. Web Client Application Architecture (Phase 1)

The web frontend is the primary operational interface for ministry staff, optimized for desktop and tablet screens in government offices.

### 9.1 Frontend Technology Stack
* **Framework:** React.js (Single Page Application via Vite)
* **Styling:** Tailwind CSS (with official government color palette: Deep Navy Slate `#0f172a`, Gold/Amber `#f59e0b`)
* **Icons:** Lucide React
* **HTTP Client:** Axios with JWT request interceptors
* **State Management:** React Context API (`AuthContext`, `MailContext`) + Local Storage persistence

### 9.2 Frontend Project Directory Structure

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── api/
│   │   ├── axiosClient.js          # Axios base config with Authorization header injection
│   │   ├── authApi.js              # Login, logout, profile endpoints
│   │   └── mailApi.js              # CRUD for mail, minutes, assignments
│   │
│   ├── assets/                     # Ministry logos, emblems, fallback images
│   │
│   ├── components/                 # Reusable UI Components
│   │   ├── common/
│   │   │   ├── Header.jsx          # Top bar with user profile & ministry brand
│   │   │   ├── Sidebar.jsx         # Module switcher (Mail, Vehicles, HR, Inventory)
│   │   │   ├── PriorityBadge.jsx   # Normal (Gray), Urgent (Red), Confidential (Purple)
│   │   │   ├── StatusBadge.jsx     # Logged, Assigned, Completed badges
│   │   │   └── Modal.jsx           # Reusable overlay dialog
│   │   │
│   │   ├── mail/
│   │   │   ├── MailTable.jsx       # Virtualized/paginated tabular registry
│   │   │   ├── MinutesTimeline.jsx # Visual audit log of attached minutes
│   │   │   ├── DutyMatcherBox.jsx # AI/Keyword duty recommendation widget
│   │   │   └── PrintMinuteSlip.jsx# CSS `@media print` formatted minute slip
│   │   │
│   │   └── forms/
│   │       ├── NewMailForm.jsx     # Day stamp & letter entry form
│   │       └── AddMinutesForm.jsx  # Secretary / AO minute entry box
│   │
│   ├── context/
│   │   ├── AuthContext.jsx         # User session state & permission checks
│   │   └── MailContext.jsx         # Active letter filter & selection state
│   │
│   ├── hooks/
│   │   ├── useAuth.js              # Custom hook for session access
│   │   └── useDutyMatcher.js       # Custom hook executing matching logic
│   │
│   ├── pages/
│   │   ├── LoginPage.jsx           # Secure login screen
│   │   ├── DashboardPage.jsx       # Analytics metrics & recent mail
│   │   ├── MailRegistryPage.jsx    # Full search/filter table
│   │   ├── MailDetailPage.jsx      # Detail view with PDF preview & minutes thread
│   │   └── AdminPage.jsx           # Duty chart & user management
│   │
│   ├── utils/
│   │   ├── dateUtils.js            # Format dates (e.g., "26 Sep 2026")
│   │   └── printUtils.js           # Trigger native browser print dialogs
│   │
│   ├── App.jsx                     # Route setup & provider wrapper
│   └── main.jsx                    # Vite entrypoint
│
├── index.html
├── tailwind.config.js
└── package.json
```

---

## 10. Backend Service Architecture & Directory Structure

The backend application is structured as a **Modular Express REST Server** connecting to a MySQL database using connection pooling (`mysql2/promise`).

### 10.1 Backend Technology Stack
* **Runtime:** Node.js (v18+)
* **Framework:** Express.js
* **Database Driver:** `mysql2/promise` (Pool connections)
* **Authentication:** JSON Web Tokens (`jsonwebtoken`) & `bcryptjs`
* **File Processing:** `multer` (Handling scanned PDF letter uploads)
* **Environment Management:** `dotenv`

### 10.2 Backend Project Directory Structure

```
backend/
├── config/
│   ├── db.js                       # MySQL Connection Pool configuration
│   └── jwt.js                      # JWT Secret key and token lifespan rules
│
├── controllers/
│   ├── authController.js           # Login, token validation, user profile fetching
│   ├── mailController.js           # Mail logging, filtering, status updates
│   ├── minutesController.js        # Executive minutes creation and audit history
│   ├── officerController.js        # Officer duty roster queries and automated matching
│   ├── vehicleController.js        # Vehicle allocation module handlers (Phase 2 expansion)
│   ├── transferController.js       # Staff transfer application handlers (Phase 2 expansion)
│   └── inventoryController.js      # Store asset issue/return handlers (Phase 2 expansion)
│
├── middleware/
│   ├── authMiddleware.js           # Verifies Bearer JWT token in HTTP request headers
│   ├── roleMiddleware.js           # RBAC checks (e.g., requireRole('SECRETARY', 'AO'))
│   ├── uploadMiddleware.js         # Multer disk storage config for scanned PDF/Image attachments
│   └── errorHandler.js             # Global central Express error handling middleware
│
├── models/
│   ├── userModel.js                # Raw SQL queries for user authentication & roles
│   ├── mailModel.js                # SQL queries for mail records, day stamps & filtering
│   ├── minutesModel.js             # SQL queries for minute history appending
│   └── dutyModel.js                # SQL queries for duty keywords & officer matching
│
├── routes/
│   ├── authRoutes.js               # /api/v1/auth (login, verify, profile)
│   ├── mailRoutes.js               # /api/v1/mail (CRUD, minutes attachment, status)
│   ├── officerRoutes.js            # /api/v1/officers (duty charts, assignment)
│   ├── vehicleRoutes.js            # /api/v1/vehicles (reserve, approve vehicles)
│   ├── transferRoutes.js           # /api/v1/transfers (transfer requests)
│   └── inventoryRoutes.js          # /api/v1/inventory (stock ledger)
│
├── uploads/                        # Physical storage directory for letter attachment files
│   └── letters/                    # Scanned PDF/Image files indexed by day stamp
│
├── .env.example                    # Template for server environment variables
├── .env                            # Active environment variables (PORT, DB_HOST, JWT_SECRET)
├── package.json                    # Dependencies & NPM scripts (npm run start, dev)
└── server.js                       # Express application entrypoint & route registration
```

---

## 11. Phase 2: Mobile Client Application Architecture (React Native)

The mobile application is designed specifically for **Ministry Secretaries**, **Administrative Officers**, and **Field Officers** who need to endorse minutes or check progress on urgent letters while traveling or attending meetings.

### 11.1 Mobile Technology Stack
* **Framework:** React Native (Expo SDK 50+)
* **Navigation:** React Navigation v6 (Native Stack + Bottom Tabs)
* **Secure Storage:** `expo-secure-store` (Encrypted storage for JWT tokens & user credentials)
* **Push Notifications:** Expo Notifications (Alerting executives when urgent mail arrives)
* **Media & Camera:** `expo-camera` & `expo-document-picker` (For scanning/attaching documents on mobile)
* **HTTP Client:** Axios with JWT Interceptors & network retry logic

### 11.2 Mobile Project Directory Structure

```
mobile/
├── assets/                         # Native branding, fonts, icons, splash screen
│   ├── fonts/                      # Custom Sinhala/Tamil fonts (e.g., Abhaya Libre)
│   ├── icons/                      # App launcher icons and notification badges
│   ├── images/                     # Ministry emblem, crest, placeholder banners
│   └── splash.png                  # Native splash loading screen
│
├── src/
│   ├── api/                        # HTTP Client & Endpoint Contracts
│   │   ├── client.js               # Central Axios instance with JWT SecureStore injection
│   │   ├── authApi.js              # Login, token refresh, biometric session verification
│   │   ├── mailApi.js              # Fetch executive mail, add quick minutes, update status
│   │   └── notificationApi.js      # Register push token with backend server
│   │
│   ├── components/                 # Reusable Native UI Components
│   │   ├── common/
│   │   │   ├── CustomButton.jsx    # Touch-optimized styled action buttons
│   │   │   ├── PriorityBadge.jsx   # Colored badge for Urgent/Confidential flags
│   │   │   ├── StatusBadge.jsx     # Status indicator pill (Logged, In Progress, Completed)
│   │   │   ├── SearchBar.jsx       # Fast client-side day stamp / sender query bar
│   │   │   └── LoadingOverlay.jsx  # Full-screen activity indicator
│   │   │
│   │   ├── mail/
│   │   │   ├── MailCard.jsx        # Touch-friendly letter summary card for FlatList
│   │   │   ├── MinutesTimeline.jsx # Compact native timeline of endorsed minutes
│   │   │   ├── DocumentViewer.jsx  # Native PDF & image attachment viewer modal
│   │   │   └── QuickMinuteSheet.jsx# Bottom-sheet modal for fast minute entry
│   │   │
│   │   └── forms/
│   │       ├── VoiceMinuteInput.jsx# Voice-to-text minute recording component
│   │       └── StatusUpdateForm.jsx# Action officer progress note & photo submission
│   │
│   ├── config/                     # Application Constants & Environment Rules
│   │   ├── constants.js            # API base URLs, timeout rules, status codes
│   │   └── theme.js                # Government color palette (Navy, Gold, Slate)
│   │
│   ├── context/                    # React Context State Management
│   │   ├── AuthContext.jsx         # Mobile session, biometric login state, token retention
│   │   ├── MailContext.jsx         # Mobile mail feed cache, active unread counter
│   │   └── NotificationContext.jsx # Handlers for push alerts & badge counts
│   │
│   ├── hooks/                      # Custom Mobile React Hooks
│   │   ├── useAuth.js              # Hook for authentication context
│   │   ├── useMail.js              # Hook for mail fetching & filter operations
│   │   ├── useBiometrics.js        # Native Touch ID / Face ID authentication hook
│   │   └── usePushNotification.js # Expo push token generation and message listeners
│   │
│   ├── navigation/                 # React Navigation Architecture
│   │   ├── AppNavigator.jsx        # Root Stack Container (Auth check & routing switch)
│   │   ├── AuthStack.jsx           # Screen stack for unauthenticated state (Login screen)
│   │   ├── MainTabNavigator.jsx    # Bottom Tab Navigation (Dashboard, Inbox, History, Profile)
│   │   └── MailStack.jsx           # Native Stack (Mail List -> Detail View -> Add Minutes)
│   │
│   ├── screens/                    # Mobile View Screens
│   │   ├── auth/
│   │   │   └── LoginScreen.jsx     # Biometric & NIC/Password login screen
│   │   │
│   │   ├── dashboard/
│   │   │   └── DashboardScreen.jsx # Executive overview (Unreviewed mail count, urgent list)
│   │   │
│   │   ├── mail/
│   │   │   ├── ExecutiveInboxScreen.jsx # Primary feed for Secretary & AO
│   │   │   ├── MailDetailScreen.jsx     # Full letter details, PDF viewer, minutes thread
│   │   │   └── AddMinutesScreen.jsx     # Full minute writing screen with preset chips
│   │   │
│   │   └── profile/
│   │       └── ProfileScreen.jsx   # Officer details, duty section info, logout button
│   │
│   └── utils/                      # Helper & Utility Functions
│       ├── dateUtils.js            # Native date and time formatting
│       ├── storageUtils.js         # SecureStore abstraction (getItem, setItem, deleteItem)
│       └── notificationUtils.js    # Local alert triggers
│
├── App.jsx                         # Mobile Entry Point (Providers, Navigation Container, App Loading)
├── app.json                        # Expo App Configuration (Bundle ID, permissions, icon paths)
├── babel.config.js                 # Babel plugins (Reanimated, Tailwind/NativeWind)
├── package.json                    # Dependencies (react-native, expo, react-navigation, axios)
└── README.md                       # Mobile build & deployment instructions
```

---

## 12. Enterprise Modular Expansion Roadmap

```
                          ┌───────────────────────────┐
                          │   Core Authorization      │
                          │   & User Directory        │
                          └─────────────┬─────────────┘
                                        │
      ┌──────────────────┬──────────────┴──────────────┬──────────────────┐
      ▼                  ▼                             ▼                  ▼
┌────────────┐    ┌────────────┐                ┌────────────┐    ┌────────────┐
│ Module 1:  │    │ Module 2:  │                │ Module 3:  │    │ Module 4:  │
│ Mail &     │    │ Vehicle    │                │ Staff      │    │ Asset &    │
│ Minutes    │    │ Allocation │                │ Transfers  │    │ Stock      │
│ (Phase 1)  │    │ (වහන)      │                │ Module     │    │ Inventory  │
└────────────┘    └────────────┘                └────────────┘    └────────────┘
```

1. **Module 1: Mail Management (Phase 1 Target)** - Full correspondence logging, executive minutes, duty matching.
2. **Module 2: Vehicle Allocation (වහන වෙන්කිරීම)** - Shares the central `users` table to manage pool vehicle bookings, driver assignments, and trip logs.
3. **Module 3: Staff Transfers (නිලධාරී මාරුවීම්)** - Routes officer transfer appeals and service history approvals.
4. **Module 4: Asset & Inventory Ledger** - Tracks ministry IT equipment, office furniture, and stock issuance.

---

## 13. Security, Maintenance & AI Ingestion Guidelines

1. **Audit Logs:** All minutes edits, status updates, and letter re-assignments generate an immutable audit record containing `user_id`, `timestamp`, `ip_address`, and `action_delta`.
2. **AI Comprehension Note:** An AI agent reading this document can parse any raw incoming letter text, extract keywords, query the `officer_duties` table schema, and construct a valid `POST /api/v1/mail/:id/assign` payload with high precision.