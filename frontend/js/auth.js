const API_URL = 'http://localhost:5000/api';

// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (token) {
        document.querySelector('.auth-links')?.classList.add('hidden');
        document.querySelector('.user-menu')?.classList.remove('hidden');
        document.querySelector('.username')?.textContent = user.username || 'Player';
        
        // Update nav for logged in user
        document.querySelectorAll('.nav-links a').forEach(link => {
            if (link.getAttribute('href') === 'login.html' || link.getAttribute('href') === 'register.html') {
                link.parentElement.style.display = 'none';
            }
        });
    }
}

// Register
async function register(e) {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('username').value,
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
        teamName: document.getElementById('teamName').value
    };
    
    try {
        const response = await fetch(`${API_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showAlert('Registration successful!', 'success');
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
            showAlert(data.message || 'Registration failed', 'error');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
    }
}

// Login
async function login(e) {
    e.preventDefault();
    
    const credentials = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
    };
    
    try {
        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(credentials)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            showAlert('Login successful!', 'success');
            setTimeout(() => window.location.href = 'dashboard.html', 1500);
        } else {
            showAlert(data.message || 'Invalid credentials', 'error');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
    }
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Show alert
function showAlert(message, type) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const form = document.querySelector('form');
    form.insertBefore(alertDiv, form.firstChild);
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Auth check on page load
document.addEventListener('DOMContentLoaded', checkAuth);
