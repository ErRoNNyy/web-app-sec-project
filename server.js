const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/assets', express.static(path.join(__dirname, 'database', 'assets')));

app.use(session({
    secret: 'your-secret-key-here',
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
    
    db.get(query, [], (err, user) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        
        if (user) {
            req.session.userId = user.id;
            req.session.username = user.username;
            req.session.role = user.role;
            req.session.isAuthenticated = true;
            
            res.json({ 
                success: true, 
                message: 'Login successful',
                user: { id: user.id, username: user.username, role: user.role }
            });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    });
});

app.post('/api/register', (req, res) => {
    const { username, password, email } = req.body;
    const query = `INSERT INTO users (username, password, email) VALUES ('${username}', '${password}', '${email}')`;
    
    db.run(query, [], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            return res.status(500).json({ error: 'Registration failed' });
        }
        res.json({ success: true, message: 'Registration successful', userId: this.lastID });
    });
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

app.post('/api/posts', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { title, content, is_private } = req.body;
    const userId = req.session.userId;
    
    const query = `INSERT INTO posts (user_id, title, content, is_private) VALUES (?, ?, ?, ?)`;
    
    db.run(query, [userId, title, content, is_private ? 1 : 0], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to create post' });
        }
        res.json({ success: true, postId: this.lastID });
    });
});

app.put('/api/posts/:id', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.id;
    const userId = req.session.userId;
    const { title, content, is_private } = req.body;
    
    const query = `UPDATE posts SET title = ?, content = ?, is_private = ? WHERE id = ? AND user_id = ?`;
    
    db.run(query, [title, content, is_private ? 1 : 0, postId, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update post' });
        }
        if (this.changes === 0) {
            return res.status(403).json({ error: 'Not authorized to update this post' });
        }
        res.json({ success: true, changes: this.changes });
    });
});

app.delete('/api/posts/:id', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.id;
    const userId = req.session.userId;
    
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

app.post('/api/posts/:postId/comments', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const postId = req.params.postId;
    const { content } = req.body;
    const userId = req.session.userId;
    
    const query = `INSERT INTO comments (post_id, user_id, content) VALUES (?, ?, ?)`;
    
    db.run(query, [postId, userId, content], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to add comment' });
        }
        res.json({ success: true, commentId: this.lastID });
    });
});

app.get('/api/search', (req, res) => {
    const searchTerm = req.query.q;
    
    if (!searchTerm) {
        return res.json([]);
    }
    
    const query = `
        SELECT posts.*, users.username 
        FROM posts 
        JOIN users ON posts.user_id = users.id 
        WHERE posts.is_private = 0 
        AND (posts.title LIKE '%${searchTerm}%' OR posts.content LIKE '%${searchTerm}%')
        ORDER BY posts.created_at DESC
    `;
    
    db.all(query, [], (err, posts) => {
        if (err) {
            console.error('Search error:', err);
            return res.status(500).json({ error: 'Search failed' });
        }
        res.json(posts);
    });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
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

app.post('/api/tools/ping', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { host } = req.body;
    
    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }
    
    const isWindows = process.platform === 'win32';
    const command = isWindows ? `ping -n 4 ${host}` : `ping -c 4 ${host}`;
    
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        res.json({
            success: !error,
            command: command,
            output: stdout || stderr || (error ? error.message : 'No output'),
            error: error ? error.message : null
        });
    });
});

app.post('/api/tools/nslookup', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { domain } = req.body;
    
    if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
    }
    
    const command = `nslookup ${domain}`;
    
    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        res.json({
            success: !error,
            command: command,
            output: stdout || stderr || (error ? error.message : 'No output'),
            error: error ? error.message : null
        });
    });
});

app.post('/api/tools/traceroute', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { host } = req.body;
    
    if (!host) {
        return res.status(400).json({ error: 'Host is required' });
    }
    
    const isWindows = process.platform === 'win32';
    const command = isWindows ? `tracert ${host}` : `traceroute ${host}`;
    
    exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        res.json({
            success: !error,
            command: command,
            output: stdout || stderr || (error ? error.message : 'No output'),
            error: error ? error.message : null
        });
    });
});

app.post('/api/messages', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { receiver_id, subject, content } = req.body;
    const senderId = req.session.userId;
    
    const query = `INSERT INTO messages (sender_id, receiver_id, subject, content) VALUES (?, ?, ?, ?)`;
    
    db.run(query, [senderId, receiver_id, subject, content], function(err) {
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

app.put('/api/profile', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { username, email, password } = req.body;
    const userId = req.session.userId;
    
    let updates = [];
    let params = [];
    
    if (username) {
        updates.push('username = ?');
        params.push(username);
    }
    if (email) {
        updates.push('email = ?');
        params.push(email);
    }
    if (password) {
        updates.push('password = ?');
        params.push(password);
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

app.post('/api/avatar', upload.single('avatar'), (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const avatarPath = '/uploads/' + req.file.filename;
    const userId = req.session.userId;
    
    db.run('UPDATE users SET avatar = ? WHERE id = ?', [avatarPath, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to update avatar' });
        }
        res.json({ success: true, avatar: avatarPath });
    });
});

app.post('/api/change-password', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { newPassword } = req.body;
    const userId = req.session.userId;
    
    const query = `UPDATE users SET password = ? WHERE id = ?`;
    
    db.run(query, [newPassword, userId], function(err) {
        if (err) {
            return res.status(500).json({ error: 'Failed to change password' });
        }
        res.json({ success: true, message: 'Password changed successfully' });
    });
});

app.post('/api/transfer', (req, res) => {
    if (!req.session.isAuthenticated) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { to_user, amount } = req.body;
    const fromUser = req.session.username;
    
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
