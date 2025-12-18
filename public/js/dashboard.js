// XSS Protection: HTML escaping function
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    const authData = await requireAuth();
    if (!authData) return;
    
    document.getElementById('username-display').textContent = authData.user.username;
    document.getElementById('role-display').textContent = authData.user.role;
    
    await loadAllPosts();
    setupCreatePostForm();
});

async function loadAllPosts() {
    const container = document.getElementById('posts-container');
    
    try {
        const response = await fetch('/api/posts');
        const posts = await response.json();
        
        if (posts.length === 0) {
            container.innerHTML = '<p class="no-results">No posts yet. Create the first one!</p>';
            return;
        }
        
        container.innerHTML = posts.map(post => `
            <div class="post-card">
                <h3>
                    <a href="/post/${post.id}">${escapeHtml(post.title)}</a>
                    ${post.is_private ? '<span class="private-badge">Private</span>' : ''}
                </h3>
                <p class="post-meta">By ${escapeHtml(post.username)} | ${formatDate(post.created_at)}</p>
                <div class="post-content">${escapeHtml(post.content)}</div>
                <div class="post-actions">
                    <button onclick="editPost(${post.id})" class="btn btn-small btn-secondary">Edit</button>
                    <button onclick="deletePost(${post.id})" class="btn btn-small" style="background: #e74c3c;">Delete</button>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load posts</p>';
        console.error('Error loading posts:', err);
    }
}

function setupCreatePostForm() {
    const form = document.getElementById('create-post-form');
    const messageDiv = document.getElementById('post-message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('post-title').value;
        const content = document.getElementById('post-content').value;
        const is_private = document.getElementById('post-private').checked;
        
        try {
            const csrfToken = await getCSRFToken();
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ title, content, is_private, _csrf: csrfToken })
            });
            
            const data = await response.json();
            
            if (data.success) {
                messageDiv.className = 'message success';
                messageDiv.textContent = 'Post created successfully!';
                form.reset();
                await loadAllPosts();
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = data.error || 'Failed to create post';
            }
        } catch (err) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'An error occurred';
        }
    });
}

async function editPost(postId) {
    const newTitle = prompt('Enter new title:');
    if (!newTitle) return;
    
    const newContent = prompt('Enter new content:');
    if (!newContent) return;
    
    try {
        const csrfToken = await getCSRFToken();
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ title: newTitle, content: newContent, _csrf: csrfToken })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Post updated!');
            await loadAllPosts();
        } else {
            alert(data.error || 'Failed to update post');
        }
    } catch (err) {
        alert('An error occurred');
    }
}

async function deletePost(postId) {
    if (!confirm('Are you sure you want to delete this post?')) return;
    
    try {
        const csrfToken = await getCSRFToken();
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE',
            headers: { 
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ _csrf: csrfToken })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('Post deleted!');
            await loadAllPosts();
        } else {
            alert(data.error || 'Failed to delete post');
        }
    } catch (err) {
        alert('An error occurred');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
