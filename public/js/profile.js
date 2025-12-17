document.addEventListener('DOMContentLoaded', async () => {
    const authData = await requireAuth();
    if (!authData) return;
    
    document.getElementById('profile-username').textContent = authData.user.username;
    document.getElementById('profile-role').textContent = authData.user.role;
    
    setupProfileForm();
    setupViewUserForm();
});

function setupProfileForm() {
    const form = document.getElementById('profile-form');
    const messageDiv = document.getElementById('profile-message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const role = document.getElementById('role').value;
        
        const updateData = { email };
        if (password) updateData.password = password;
        if (role) updateData.role = role;
        
        try {
            const response = await fetch('/api/profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                messageDiv.className = 'message success';
                messageDiv.textContent = 'Profile updated successfully!';
                
                setTimeout(() => window.location.reload(), 1500);
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = data.error || 'Update failed';
            }
        } catch (err) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'An error occurred';
        }
    });
}

function setupViewUserForm() {
    const form = document.getElementById('view-user-form');
    const userInfoBox = document.getElementById('user-info');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = document.getElementById('user-id').value;
        
        if (!userId) {
            userInfoBox.innerHTML = '<p class="error">Please enter a user ID</p>';
            userInfoBox.classList.add('active');
            return;
        }
        
        try {
            const response = await fetch(`/api/users/${userId}`);
            const user = await response.json();
            
            if (user.error) {
                userInfoBox.innerHTML = `<p class="error">${user.error}</p>`;
            } else {
                userInfoBox.innerHTML = `
                    <h3>User Information</h3>
                    <p><strong>ID:</strong> ${user.id}</p>
                    <p><strong>Username:</strong> ${user.username}</p>
                    <p><strong>Email:</strong> ${user.email}</p>
                    <p><strong>Role:</strong> ${user.role}</p>
                    <p><strong>Created:</strong> ${formatDate(user.created_at)}</p>
                `;
            }
            userInfoBox.classList.add('active');
            
        } catch (err) {
            userInfoBox.innerHTML = '<p class="error">Failed to fetch user</p>';
            userInfoBox.classList.add('active');
        }
    });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
