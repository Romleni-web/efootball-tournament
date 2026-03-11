const API_URL = 'https://efootball-tournament-1.onrender.com/api';

// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    updateNavigation(!!token, user);
}

// Update navigation based on auth state
function updateNavigation(isLoggedIn, user) {
    const mobileNav = document.getElementById('mobileNav');
    const hamburger = document.querySelector('.mobile-menu-toggle');
    
    // Build mobile menu HTML
    let mobileMenuHTML = `
        <a href="index.html">Home</a>
        <a href="tournaments.html">Tournaments</a>
        <a href="leaderboard.html">Leaderboard</a>
    `;
    
    if (isLoggedIn) {
        mobileMenuHTML += `
            <a href="dashboard.html">My Dashboard</a>
            <hr style="width: 80%; border: 1px solid var(--border); margin: 1rem 0;">
            <span style="color: var(--primary); font-size: 0.9rem;">Hi, ${user.username || 'Player'}</span>
            <button onclick="logout()" class="btn btn-danger" style="width: 80%; margin-top: 1rem;">Logout</button>
        `;
    } else {
        mobileMenuHTML += `
            <hr style="width: 80%; border: 1px solid var(--border); margin: 1rem 0;">
            <a href="login.html" class="btn btn-outline" style="width: 80%; margin-bottom: 0.5rem;">Login</a>
            <a href="register.html" class="btn btn-primary" style="width: 80%;">Register</a>
        `;
    }
    
    if (mobileNav) {
        mobileNav.innerHTML = mobileMenuHTML;
    }
    
    // Toggle functionality
    if (hamburger) {
        hamburger.addEventListener('click', toggleMobileMenu);
    }
}

function toggleMobileMenu() {
    const mobileNav = document.getElementById('mobileNav');
    const hamburger = document.querySelector('.mobile-menu-toggle');
    
    mobileNav.classList.toggle('active');
    hamburger.classList.toggle('active');
    
    // Prevent body scroll when menu is open
    document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
}

// Close mobile menu when clicking a link
function closeMobileMenu() {
    const mobileNav = document.getElementById('mobileNav');
    const hamburger = document.querySelector('.mobile-menu-toggle');
    
    mobileNav.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.style.overflow = '';
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
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => alert.remove());
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    
    const form = document.querySelector('form') || document.querySelector('.container');
    if (form) {
        form.insertBefore(alertDiv, form.firstChild);
    }
    
    setTimeout(() => alertDiv.remove(), 5000);
}

// Check if user is logged in (for protected actions)
function requireAuth(redirectUrl = window.location.href) {
    const token = localStorage.getItem('token');
    if (!token) {
        // Save intended destination
        sessionStorage.setItem('redirectAfterLogin', redirectUrl);
        window.location.href = `login.html?redirect=${encodeURIComponent(redirectUrl)}`;
        return false;
    }
    return true;
}

// Auth check on page load
document.addEventListener('DOMContentLoaded', checkAuth);
