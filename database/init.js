const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'app.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            email TEXT,
            role TEXT DEFAULT 'user',
            avatar TEXT DEFAULT '/assets/profile_images/avatar.png',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            is_private INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER,
            mime_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            subject TEXT,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (sender_id) REFERENCES users(id),
            FOREIGN KEY (receiver_id) REFERENCES users(id)
        )
    `);

    const sampleUsers = [
        ['admin', 'admin123', 'admin@example.com', 'admin'],
        ['john', 'password', 'john@example.com', 'user'],
        ['jane', '123456', 'jane@example.com', 'user'],
        ['test', 'test', 'test@example.com', 'user']
    ];

    const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users (username, password, email, role) 
        VALUES (?, ?, ?, ?)
    `);

    sampleUsers.forEach(user => {
        insertUser.run(user);
    });
    insertUser.finalize();

    const samplePosts = [
        [1, 'Welcome to the Blog', 'This is our first blog post. Welcome everyone!', 0],
        [2, 'My Private Notes', 'This is a private post that only I should see.', 1],
        [1, 'Security Tips', 'Always use strong passwords and enable 2FA.', 0],
        [3, 'Hello World', 'Jane\'s first post on the platform.', 0]
    ];

    const insertPost = db.prepare(`
        INSERT OR IGNORE INTO posts (user_id, title, content, is_private) 
        VALUES (?, ?, ?, ?)
    `);

    samplePosts.forEach(post => {
        insertPost.run(post);
    });
    insertPost.finalize();

    const sampleComments = [
        [1, 2, 'Great post! Thanks for sharing.'],
        [1, 3, 'Very informative content.'],
        [3, 1, 'Welcome to the community!']
    ];

    const insertComment = db.prepare(`
        INSERT OR IGNORE INTO comments (post_id, user_id, content) 
        VALUES (?, ?, ?)
    `);

    sampleComments.forEach(comment => {
        insertComment.run(comment);
    });
    insertComment.finalize();

    console.log('Database initialized successfully!');
    console.log('Database location:', dbPath);
    console.log('\nSample Users Created:');
    console.log('   - admin / admin123 (admin role)');
    console.log('   - john / password');
    console.log('   - jane / 123456');
    console.log('   - test / test');
});

db.close();
