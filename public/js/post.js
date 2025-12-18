let currentPostId = null;

// XSS Protection: HTML escaping function
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', async () => {
    const pathParts = window.location.pathname.split('/');
    currentPostId = pathParts[pathParts.length - 1];
    
    if (!currentPostId || isNaN(currentPostId)) {
        document.getElementById('post-container').innerHTML = '<p class="error">Invalid post ID</p>';
        return;
    }
    
    await loadPost();
    await loadComments();
    
    const authData = await checkAuth();
    if (authData.isAuthenticated) {
        document.getElementById('comment-form').style.display = 'block';
        document.getElementById('login-prompt').style.display = 'none';
        setupCommentForm();
    }
});

async function loadPost() {
    const container = document.getElementById('post-container');
    
    try {
        const response = await fetch(`/api/posts/${currentPostId}`);
        const post = await response.json();
        
        if (post.error) {
            container.innerHTML = `<p class="error">${post.error}</p>`;
            return;
        }
        
        container.innerHTML = `
            <h1>
                ${escapeHtml(post.title)}
                ${post.is_private ? '<span class="private-badge">Private</span>' : ''}
            </h1>
            <p class="post-meta">
                By <strong>${escapeHtml(post.username)}</strong> | ${formatDate(post.created_at)}
            </p>
            <div class="post-content">${escapeHtml(post.content)}</div>
        `;
        
        document.title = `${post.title} - VulneraBlog`;
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load post</p>';
        console.error('Error loading post:', err);
    }
}

async function loadComments() {
    const container = document.getElementById('comments-container');
    
    try {
        const response = await fetch(`/api/posts/${currentPostId}/comments`);
        const comments = await response.json();
        
        if (comments.length === 0) {
            container.innerHTML = '<p class="no-results">No comments yet. Be the first to comment!</p>';
            return;
        }
        
        container.innerHTML = comments.map(comment => `
            <div class="comment-item">
                <div class="comment-author">${escapeHtml(comment.username)}</div>
                <div class="comment-date">${formatDate(comment.created_at)}</div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
            </div>
        `).join('');
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load comments</p>';
        console.error('Error loading comments:', err);
    }
}

function setupCommentForm() {
    const form = document.getElementById('comment-form');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const content = document.getElementById('comment-content').value;
        
        try {
            const csrfToken = await getCSRFToken();
            const response = await fetch(`/api/posts/${currentPostId}/comments`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ content, _csrf: csrfToken })
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('comment-content').value = '';
                await loadComments();
            } else {
                alert(data.error || 'Failed to add comment');
            }
        } catch (err) {
            alert('An error occurred');
        }
    });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
