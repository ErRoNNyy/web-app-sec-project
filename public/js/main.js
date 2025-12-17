document.addEventListener('DOMContentLoaded', async () => {
    await loadPosts();
});

async function loadPosts() {
    const container = document.getElementById('posts-container');
    
    try {
        const response = await fetch('/api/posts');
        const posts = await response.json();
        
        if (posts.length === 0) {
            container.innerHTML = '<p class="no-results">No posts yet. Be the first to create one!</p>';
            return;
        }
        
        container.innerHTML = posts.map(post => `
            <div class="post-card">
                <h3><a href="/post/${post.id}">${post.title}</a></h3>
                <p class="post-meta">By ${post.username} | ${formatDate(post.created_at)}</p>
                <p class="post-excerpt">${truncate(post.content, 150)}</p>
            </div>
        `).join('');
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load posts</p>';
        console.error('Error loading posts:', err);
    }
}

function truncate(text, length) {
    if (text.length <= length) return text;
    return text.substring(0, length) + '...';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
