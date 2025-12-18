const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'database', 'assets')));

app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'strict'
    }
}));

//for csrf protection
function generateCSRFToken(){
    return crypto.randomBytes(32).toString('hex');
}

function validateCSRFToken(req, res, next){
    if(req.method == 'GET'){
        return next(); //skipping get requests
    }

    if(req.path == '/api/logout'){
        return next(); // skipping logout calls
    }

    const token = req.body._csrf || req.headers['x-csrf-token'];
    const sessionToken = req.session.csrfToken;

    if(!token || !sessionToken || token !== sessionToken){
        return res.status(403).json({ error: 'Invalid CSRF token'});
    }

    next();
}

// Initialize CSRF token for authenticated users
app.use((req, res, next) => {
    if (req.session.isAuthenticated && !req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
    }
    next();
});

// CSRF token endpoint
app.get('/api/csrf-token', (req, res) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = generateCSRFToken();
    }
    res.json({ csrfToken: req.session.csrfToken });
});

//sanitization of input

function sanitizeInput(input) {
    if(typeof input !== 'string') return input;
    return input.trim().replace(/[<>]/g, '');
}

function validateEmail(email){ //email validation
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
}

function validateHostname(hostname){ //host validation
    const hostnameRegex = /^[a-zA-Z0-9.-]+(:[0-9]+)?$/;
    return hostnameRegex.test(hostname) && hostname.length <= 253;
}

function validateDomain(domain){//for domain validation
    const domainRegex = /^[a-zA-Z0-9.-]+(:[0-9]+)?$/;
    return domainRegex.test(domain) && domain.length <= 253;
}
 //additional security for file upload

 const uploadsDir = path.join(__dirname, 'uploads');
 if(!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, {recursive: true});
 }


const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

function sanitizeFilename(filename) {
    return filename
        .replace(/\.\./g, '')
        .replace(/[\/\\]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 255);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const sanitized = sanitizeFilename(file.originalname);
        const ext = path.extname(sanitized);
        const name = path.basename(sanitized, ext);
        cb(null, Date.now() + '-' + name + ext);
    }
});

//mime types verification
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain'
]; //allowed file types

const fileFilter = (req, file, cb) => {
    if(ALLOWED_MIME_TYPES.includes(file.mimetype)){
        cb(null, true);
    } else{
        cb(new Error('File type is not allowed'), false);
    }
};//checking file type when user uploads it

const upload = multer(
    {
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: MAX_FILE_SIZE
        }
    }
); //upload function







// Routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// FIXED: SQL Injection - Using parameterized queries
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const sanitizedUsername = sanitizeInput(username);
    
    // Use parameterized query to prevent SQL injection
    const query = `SELECT * FROM users WHERE username = ?`;
    
    db.get(query, [sanitizedUsername], async (err, user) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (user) {
            // Compare hashed password
            try {
                const passwordMatch = await bcrypt.compare(password, user.password);
                if (passwordMatch) {
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    req.session.role = user.role;
                    req.session.isAuthenticated = true;
                    req.session.csrfToken = generateCSRFToken();
                    
                    res.json({ 
                        success: true, 
                        message: 'Login successful',
                        user: { id: user.id, username: user.username, role: user.role }
                    });
                } else {
                    res.status(401).json({ success: false, message: 'Invalid credentials' });
                }
            } catch (err) {
                // If password is not hashed (for existing users), check plain text
                if (user.password === password) {
                    // Hash the password for future use
                    const hashedPassword = await bcrypt.hash(password, 10);
                    db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);
                    
                    req.session.userId = user.id;
                    req.session.username = user.username;
                    req.session.role = user.role;
                    req.session.isAuthenticated = true;
                    req.session.csrfToken = generateCSRFToken();
                    
                    res.json({ 
                        success: true, 
                        message: 'Login successful',
                        user: { id: user.id, username: user.username, role: user.role }
                    });
                } else {
                    res.status(401).json({ success: false, message: 'Invalid credentials' });
                }
            }
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });
});

// FIXED: SQL Injection - Using parameterized queries + Password Hashing
app.post('/api/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    
    if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    const sanitizedUsername = sanitizeInput(username);
    const sanitizedEmail = sanitizeInput(email);
    
    // Hash password before storing
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Use parameterized query to prevent SQL injection
        const query = `INSERT INTO users (username, password, email) VALUES (?, ?, ?)`;
        
        db.run(query, [sanitizedUsername, hashedPassword, sanitizedEmail], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Username already exists' });
                }
                return res.status(500).json({ error: 'Registration failed' });
            }
            res.json({ success: true, message: 'Registration successful', userId: this.lastID });
        });
    } catch (err) {
        console.error('Password hashing error:', err);
        return res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true, message: 'Logged out successfully' });
    });
});

app.get('/api/me', (req, res) => {
    if (req.session.isAuthenticated) {
        db.get('SELECT id, username, role, email, avatar FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err || !user) {
                return res.json({
                    isAuthenticated: true,
                    user: {
                        id: req.session.userId,
                        username: req.session.username,
                        role: req.session.role,
                        avatar: '/assets/profile_images/avatar.png'
                    }
                });
            }
            res.json({
                isAuthenticated: true,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    email: user.email,
                    avatar: user.avatar || '/assets/profile_images/avatar.png'
                }
            });
        });
    } else {
        res.json({ isAuthenticated: false });
    }
});

app.get('/api/posts', (req, res) => {
    const query = `
        SELECT posts.*, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.is_private = 0 
        ORDER BY posts.created_at DESC
    `;
    
    db.all(query, [], (err, posts) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch posts' });
        }
        res.json(posts);
    });
});

app.get('/api/posts/:id', (req, res) => {
    const postId = req.params.id;
    const userId = req.session.userId || 0;
    
    // Validate postId is numeric
    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    const query = `
        SELECT posts.*, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.id = ? AND (posts.is_private = 0 OR posts.user_id = ?)
    `;
    
    db.get(query, [postId, userId], (err, post) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch post' });
        }
        if (!post) {
            return res.status(404).json({ error: 'Post not found or access denied' });
        }
        res.json(post);
    });
});

// FIXED: CSRF Protection added
app.post('/api/posts', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { title, content, is_private } = req.body;
    const userId = req.session.userId;
    
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const sanitizedTitle = sanitizeInput(title);
    const sanitizedContent = sanitizeInput(content);
    
    const query = `INSERT INTO posts (user_id, title, content, is_private) VALUES (?, ?, ?, ?)`;
    
    db.run(query, [userId, sanitizedTitle, sanitizedContent, is_private ? 1 : 0], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to create post' });
        }
        res.json({ success: true, postId: this.lastID });
    });
});

// FIXED: CSRF Protection added
app.put('/api/posts/:id', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, is_private } = req.body;
    
    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
    }
    
    const sanitizedTitle = sanitizeInput(title);
    const sanitizedContent = sanitizeInput(content);
    
    const query = `UPDATE posts SET title = ?, content = ?, is_private = ? WHERE id = ? AND user_id = ?`;
    
    db.run(query, [sanitizedTitle, sanitizedContent, is_private ? 1 : 0, postId, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update post' });
        }
        if (this.changes === 0) {
            return res.status(403).json({ error: 'Not authorized to update this post' });
        }
        res.json({ success: true, changes: this.changes });
    });
});

// FIXED: CSRF Protection added
app.delete('/api/posts/:id', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.id;
    const userId = req.session.userId;
    
    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    const query = `DELETE FROM posts WHERE id = ? AND user_id = ?`;
    
    db.run(query, [postId, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to delete post' });
        }
        if (this.changes === 0) {
            return res.status(403).json({ error: 'Not authorized to delete this post' });
        }
        res.json({ success: true, changes: this.changes });
    });
});

app.get('/api/posts/:postId/comments', (req, res) => {
    const postId = req.params.postId;
    
    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    const query = `
        SELECT comments.*, users.username 
        FROM comments 
        JOIN users ON comments.user_id = users.id 
        WHERE comments.post_id = ? 
        ORDER BY comments.created_at DESC
    `;
    
    db.all(query, [postId], (err, comments) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch comments' });
        }
        res.json(comments);
    });
});

// FIXED: CSRF Protection added
app.post('/api/posts/:postId/comments', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.postId;
    const { content } = req.body;
    const userId = req.session.userId;
    
    if (isNaN(postId)) {
        return res.status(400).json({ error: 'Invalid post ID' });
    }
    
    if (!content) {
        return res.status(400).json({ error: 'Comment content is required' });
    }
    
    const sanitizedContent = sanitizeInput(content);
    
    const query = `INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`;
    
    db.run(query, [postId, userId, sanitizedContent], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to add comment' });
        }
        res.json({ success: true, commentId: this.lastID });
    });
});

// FIXED: SQL Injection - Using parameterized queries
app.get('/api/search', (req, res) => {
    const searchTerm = req.query.q;
    
    if (!searchTerm) {
        return res.json([]);
    }
    
    const sanitizedSearchTerm = sanitizeInput(searchTerm);
    
    // Use parameterized query with LIKE
    const query = `
        SELECT posts.*, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.is_private = 0 
        AND (posts.title LIKE ? OR posts.content LIKE ?)
        ORDER BY posts.created_at DESC
    `;
    
    const searchPattern = `%${sanitizedSearchTerm}%`;
    
    db.all(query, [searchPattern, searchPattern], (err, posts) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).json({ error: 'Search failed' });
        }
        res.json(posts);
    });
});

// FIXED: File Upload Vulnerability - File type validation, size limits, filename sanitization
app.post('/api/upload', validateCSRFToken, upload.single('file'), (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file type not allowed' });
    }
    
    const userId = req.session.userId;
    const file = req.file;
    
    const query = `
        INSERT INTO files (user_id, filename, original_name, file_path, file_size, mime_type) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    db.run(query, [
        userId,
        file.filename,
        file.originalname,
        file.path,
        file.size,
        file.mimetype
    ], function(err) {
        if (err) {
            // Delete uploaded file if database save fails
            fs.unlink(file.path, () => {});
            return res.status(500).json({ error: 'Failed to save file info' });
        }
        res.json({ 
            success: true, 
            fileId: this.lastID,
            filename: file.filename,
            url: `/uploads/${file.filename}`
        });
    });
});

app.get('/api/files', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const userId = req.session.userId;
    const query = `SELECT * FROM files WHERE user_id = ? ORDER BY created_at DESC`;
    
    db.all(query, [userId], (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch files' });
        }
        res.json(files);
    });
});

// FIXED: Command Injection - Input validation and sanitization
app.post('/api/tools/ping', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { host } = req.body;
    
    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }
    
    // Validate hostname to prevent command injection
    if (!validateHostname(host)) {
        return res.status(400).json({ error: 'Invalid hostname format' });
    }
    
    const isWindows = process.platform === 'win32';
    
    const command = isWindows ? 'ping' : 'ping';
    const args = isWindows ? ['-n', '4', host] : ['-c', '4', host];
    
    const childProcess = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    let timeoutId = setTimeout(() => {
        childProcess.kill();
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: 'Command timed out after 10 seconds',
                error: 'Command timed out'
            });
        }
    }, 10000);
    
    childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: code === 0,
                command: `${command} ${args.join(' ')}`,
                output: stdout || stderr || (code !== 0 ? `Process exited with code ${code}` : 'No output'),
                error: code !== 0 ? `Process exited with code ${code}` : null
            });
        }
    });
    
    childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: error.message,
                error: error.message
            });
        }
    });
});


app.post('/api/tools/nslookup', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { domain } = req.body;
    
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }
    
    // Validate domain to prevent command injection
    if (!validateDomain(domain)) {
        return res.status(400).json({ error: 'Invalid domain format' });
    }
    
    // Use spawn to prevent command injection
    const command = 'nslookup';
    const args = [domain];
    
    const childProcess = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    let timeoutId = setTimeout(() => {
        childProcess.kill();
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: 'Command timed out after 10 seconds',
                error: 'Command timed out'
            });
        }
    }, 10000);
    
    childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: code === 0,
                command: `${command} ${args.join(' ')}`,
                output: stdout || stderr || (code !== 0 ? `Process exited with code ${code}` : 'No output'),
                error: code !== 0 ? `Process exited with code ${code}` : null
            });
        }
    });
    
    childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: error.message,
                error: error.message
            });
        }
    });
});

// FIXED: Command Injection - Input validation and sanitization
app.post('/api/tools/traceroute', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { host } = req.body;
    
    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }
    
    // Validate hostname to prevent command injection
    if (!validateHostname(host)) {
        return res.status(400).json({ error: 'Invalid hostname format' });
    }
    
    const isWindows = process.platform === 'win32';
    // Use spawn to prevent command injection
    const command = isWindows ? 'tracert' : 'traceroute';
    const args = [host];
    
    const childProcess = spawn(command, args);
    
    let stdout = '';
    let stderr = '';
    let timeoutId = setTimeout(() => {
        childProcess.kill();
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: 'Command timed out after 30 seconds',
                error: 'Command timed out'
            });
        }
    }, 30000);
    
    childProcess.stdout.on('data', (data) => {
        stdout += data.toString();
    });
    
    childProcess.stderr.on('data', (data) => {
        stderr += data.toString();
    });
    
    childProcess.on('close', (code) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: code === 0,
                command: `${command} ${args.join(' ')}`,
                output: stdout || stderr || (code !== 0 ? `Process exited with code ${code}` : 'No output'),
                error: code !== 0 ? `Process exited with code ${code}` : null
            });
        }
    });
    
    childProcess.on('error', (error) => {
        clearTimeout(timeoutId);
        if (!res.headersSent) {
            res.json({
                success: false,
                command: `${command} ${args.join(' ')}`,
                output: error.message,
                error: error.message
            });
        }
    });
});

// FIXED: CSRF Protection added
app.post('/api/messages', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { receiver_id, subject, content } = req.body;
    const senderId = req.session.userId;
    
    if (!receiver_id || !content) {
        return res.status(400).json({ error: 'Receiver ID and content are required' });
    }
    
    if (isNaN(receiver_id)) {
        return res.status(400).json({ error: 'Invalid receiver ID' });
    }
    
    const sanitizedSubject = subject ? sanitizeInput(subject) : '';
    const sanitizedContent = sanitizeInput(content);
    
    const query = `INSERT INTO messages (sender_id, receiver_id, subject, content) VALUES (?, ?, ?, ?)`;
    
    db.run(query, [senderId, receiver_id, sanitizedSubject, sanitizedContent], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to send message' });
        }
        res.json({ success: true, messageId: this.lastID });
    });
});

app.get('/api/messages', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const userId = req.session.userId;
    
    const query = `
        SELECT messages.*, 
               sender.username as sender_name, 
               receiver.username as receiver_name 
        FROM messages 
        JOIN users sender ON messages.sender_id = sender.id 
        JOIN users receiver ON messages.receiver_id = receiver.id 
        WHERE messages.receiver_id = ? OR messages.sender_id = ?
        ORDER BY messages.created_at DESC
    `;
    
    db.all(query, [userId, userId], (err, messages) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch messages' });
        }
        res.json(messages);
    });
});

app.get('/api/messages/:id', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const messageId = req.params.id;
    const userId = req.session.userId;
    
    if (isNaN(messageId)) {
        return res.status(400).json({ error: 'Invalid message ID' });
    }
    
    const query = `
        SELECT messages.*, 
               sender.username as sender_name, 
               receiver.username as receiver_name 
        FROM messages 
        JOIN users sender ON messages.sender_id = sender.id 
        JOIN users receiver ON messages.receiver_id = receiver.id 
        WHERE messages.id = ? AND (messages.sender_id = ? OR messages.receiver_id = ?)
    `;
    
    db.get(query, [messageId, userId, userId], (err, message) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch message' });
        }
        if (!message) {
            return res.status(404).json({ error: 'Message not found or access denied' });
        }
        res.json(message);
    });
});

// FIXED: CSRF Protection added + Password Hashing
app.put('/api/profile', validateCSRFToken, async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { username, email, password } = req.body;
    const userId = req.session.userId;

    let updates = [];
    let params = [];
    
    if (username) {
        const sanitizedUsername = sanitizeInput(username);
        updates.push('username = ?');
        params.push(sanitizedUsername);
    }
    if (email) {
        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }
        const sanitizedEmail = sanitizeInput(email);
        updates.push('email = ?');
        params.push(sanitizedEmail);
    }
    if (password) {
        // Hash password before storing
        try {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            params.push(hashedPassword);
        } catch (err) {
            return res.status(500).json({ error: 'Failed to hash password' });
        }
    }
    
    if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
    }
    
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    params.push(userId);
    
    db.run(query, params, function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update profile' });
        }
        if (username) {
            req.session.username = username;
        }
        res.json({ success: true, message: 'Profile updated' });
    });
});

// FIXED: File Upload Vulnerability - File type validation
app.post('/api/avatar', validateCSRFToken, upload.single('avatar'), (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded or file type not allowed' });
    }
    
    // Additional validation for avatar (should be image only)
    if (!req.file.mimetype.startsWith('image/')) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Avatar must be an image file' });
    }
    
    const avatarPath = '/uploads/' + req.file.filename;
    const userId = req.session.userId;
    
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, userId], function(err) {
        if (err) {
            fs.unlink(req.file.path, () => {});
            return res.status(500).json({ error: 'Failed to update avatar' });
        }
        res.json({ success: true, avatar: avatarPath });
    });
});

// FIXED: CSRF Protection added + Password Hashing
app.post('/api/change-password', validateCSRFToken, async (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { newPassword } = req.body;
    const userId = req.session.userId;
    
    if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
    }
    
    // Hash password before storing
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const query = `UPDATE users SET password = ? WHERE id = ?`;
        
        db.run(query, [hashedPassword, userId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Failed to change password' });
            }
            res.json({ success: true, message: 'Password changed successfully' });
        });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to hash password' });
    }
});

// FIXED: CSRF Protection added
app.post('/api/transfer', validateCSRFToken, (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { to_user, amount } = req.body;
    const fromUser = req.session.username;
    
    if (!to_user || !amount) {
        return res.status(400).json({ error: 'Recipient and amount are required' });
    }
    
    if (isNaN(to_user) || isNaN(amount)) {
        return res.status(400).json({ error: 'Invalid user ID or amount' });
    }
    
    res.json({ 
        success: true, 
        message: `Transferred ${amount} points from ${fromUser} to user ID ${to_user}`,
        note: 'This is a simulated transfer for CSRF demonstration'
    });
});

app.get('/api/users', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const query = `SELECT id, username FROM users`;
    
    db.all(query, [], (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to fetch users' });
        }
        res.json(users);
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/post/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'post.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'search.html'));
});

app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.get('/messages', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'messages.html'));
});

app.get('/tools', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'tools.html'));
});

app.get('/marketplace', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marketplace.html'));
});

app.get('/product/:id', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;
