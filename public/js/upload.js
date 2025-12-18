let selectedFile = null;

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
    
    setupUploadArea();
    setupUploadForm();
    await loadFiles();
});

function setupUploadArea() {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const filePreview = document.getElementById('file-preview');
    const uploadBtn = document.getElementById('upload-btn');
    
    uploadArea.addEventListener('click', () => {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#e74c3c';
        uploadArea.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.borderColor = '#333';
        uploadArea.style.backgroundColor = 'transparent';
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.borderColor = '#333';
        uploadArea.style.backgroundColor = 'transparent';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileSelect(e.target.files[0]);
        }
    });
}

function handleFileSelect(file) {
    selectedFile = file;
    const filePreview = document.getElementById('file-preview');
    const uploadBtn = document.getElementById('upload-btn');
    
    filePreview.innerHTML = `
        <p><strong>Selected File:</strong> ${file.name}</p>
        <p><strong>Size:</strong> ${formatFileSize(file.size)}</p>
        <p><strong>Type:</strong> ${file.type || 'Unknown'}</p>
    `;
    filePreview.classList.add('active');
    uploadBtn.disabled = false;
}

function setupUploadForm() {
    const form = document.getElementById('upload-form');
    const messageDiv = document.getElementById('upload-message');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!selectedFile) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'Please select a file first';
            return;
        }
        
        const formData = new FormData();
        formData.append('file', selectedFile);
        
        try {
            const csrfToken = await getCSRFToken();
            formData.append('_csrf', csrfToken);
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfToken
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                messageDiv.className = 'message success';
                messageDiv.textContent = `File uploaded successfully! URL: ${data.url}`;
                
                selectedFile = null;
                document.getElementById('file-preview').classList.remove('active');
                document.getElementById('upload-btn').disabled = true;
                document.getElementById('file-input').value = '';
                
                await loadFiles();
            } else {
                messageDiv.className = 'message error';
                messageDiv.textContent = data.error || 'Upload failed';
            }
        } catch (err) {
            messageDiv.className = 'message error';
            messageDiv.textContent = 'An error occurred during upload';
        }
    });
}

async function loadFiles() {
    const container = document.getElementById('files-container');
    
    try {
        const response = await fetch('/api/files');
        const files = await response.json();
        
        if (files.length === 0) {
            container.innerHTML = '<p class="no-results">No files uploaded yet</p>';
            return;
        }
        
        container.innerHTML = files.map(file => `
            <div class="file-item">
                <div class="file-name">${escapeHtml(file.original_name)}</div>
                <div class="file-info">
                    <p>Size: ${formatFileSize(file.file_size)}</p>
                    <p>Type: ${escapeHtml(file.mime_type || 'Unknown')}</p>
                    <p>Uploaded: ${formatDate(file.created_at)}</p>
                    <p><a href="/uploads/${escapeHtml(file.filename)}" target="_blank">View/Download</a></p>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        container.innerHTML = '<p class="error">Failed to load files</p>';
        console.error('Error loading files:', err);
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}
