async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('Auth check failed:', err);
        return { isAuthenticated: false };
    }
}

async function updateAuthUI() {
    const authData = await checkAuth();
    const authLinks = document.getElementById('auth-links');
    
    if (authLinks) {
        if (authData.isAuthenticated) {
            authLinks.innerHTML = '';
        } else {
            authLinks.innerHTML = `
                <a href="/login">Login</a>
                <a href="/register">Register</a>
            `;
        }
    }
    
    return authData;
}

async function logout() {
    try {
        const response = await fetch('/api/logout', { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/login';
        }
    } catch (err) {
        console.error('Logout failed:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    updateAuthUI();
});

async function requireAuth() {
    const authData = await checkAuth();
    if (!authData.isAuthenticated) {
        window.location.href = '/login';
        return null;
    }
    return authData;
}
