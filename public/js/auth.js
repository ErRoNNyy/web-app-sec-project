// CSRF Token Management
let csrfToken = null;

async function getCSRFToken() {
    if (csrfToken) return csrfToken;
    try {
        const response = await fetch('/api/csrf-token');
        const data = await response.json();
        csrfToken = data.csrfToken;
        return csrfToken;
    } catch (err) {
        console.error('Failed to get CSRF token:', err);
        return null;
    }
}

async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        const data = await response.json();
        if (data.isAuthenticated) {
            // Get CSRF token when authenticated
            await getCSRFToken();
        }
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
            csrfToken = null; // Clear CSRF token on logout
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
