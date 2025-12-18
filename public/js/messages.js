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
    
    setupMessageForm();
    setupViewMessageForm();
    await loadMessages();
});

function setupMessageForm() {
    const form = document.getElementById('message-form');
    const messageDiv = document.getElementById('send-message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const receiver_id = document.getElementById('receiver-id').value;
        const subject = document.getElementById('subject').value;
        const content = document.getElementById('content').value;
        
        try {
            const csrfToken = await getCSRFToken();
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({ receiver_id, subject, content, _csrf: csrfToken })
            });
            
            const data = await response.json();
            
            if (data.success) {
                messageDiv.className = 'message success';
                messageDiv.textContent = 'Message sent successfully!';
                form.reset();
                await loadMessages();
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = data.error || 'Failed to send message';
            }
        } catch (err) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'An error occurred';
        }
    });
}

function setupViewMessageForm() {
    const form = document.getElementById('view-message-form');
    const detailBox = document.getElementById('single-message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const messageId = document.getElementById('message-id').value;
        
        if (!messageId) {
            detailBox.innerHTML = '<p class="error">Please enter a message ID</p>';
            detailBox.classList.add('active');
            return;
        }
        
        try {
            const response = await fetch(`/api/messages/${messageId}`);
            const message = await response.json();
            
            if (message.error) {
                detailBox.innerHTML = `<p class="error">${message.error}</p>`;
            } else {
                detailBox.innerHTML = `
                    <h3>Message Details</h3>
                    <p><strong>ID:</strong> ${escapeHtml(message.id)}</p>
                    <p><strong>From:</strong> ${escapeHtml(message.sender_name)}</p>
                    <p><strong>To:</strong> ${escapeHtml(message.receiver_name)}</p>
                    <p><strong>Subject:</strong> ${escapeHtml(message.subject || '(no subject)')}</p>
                    <p><strong>Date:</strong> ${formatDate(message.created_at)}</p>
                    <hr>
                    <div class="message-body">${escapeHtml(message.content)}</div>
                `;
            }
            detailBox.classList.add('active');
            
        } catch (err) {
            detailBox.innerHTML = '<p class="error">Failed to fetch message</p>';
            detailBox.classList.add('active');
        }
    });
}

async function loadMessages() {
    const container = document.getElementById('messages-container');
    
    try {
        const response = await fetch('/api/messages');
        const messages = await response.json();
        
        if (messages.length === 0) {
            container.innerHTML = '<p class="no-results">No messages yet</p>';
            return;
        }
        
        container.innerHTML = messages.map(msg => `
            <div class="message-item">
                <div class="message-header">
                    <span class="message-subject">${escapeHtml(msg.subject || '(no subject)')}</span>
                    <span class="message-date">${formatDate(msg.created_at)}</span>
                </div>
                <div class="message-parties">
                    From: <strong>${escapeHtml(msg.sender_name)}</strong> → To: <strong>${escapeHtml(msg.receiver_name)}</strong>
                </div>
                <div class="message-content">${escapeHtml(msg.content)}</div>
            </div>
        `).join('');
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load messages</p>';
        console.error('Error loading messages:', err);
    }
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
