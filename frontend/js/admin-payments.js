// Admin Payments Verification (Spec Steps 3-4)
let currentPaymentId = null;
let payments = [];

async function loadPendingPayments() {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/payments/pending`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.success) {
            payments = data.payments;
            displayPayments(payments);
            updateStats();
        } else {
            document.getElementById('paymentsList').innerHTML = '<p>No pending payments</p>';
        }
    } catch (error) {
        showAlert('Failed to load payments', 'error');
    }
}

function displayPayments(payments) {
    const container = document.getElementById('paymentsList');
    if (payments.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No pending payments 🎉</p>';
        return;
    }
    
    container.innerHTML = payments.map(payment => `
        <div class="payment-card" onclick="openPaymentModal('${payment.id}')" style="cursor: pointer;">
            <div class="payment-header">
                <div>
                    <h3>${payment.user.username}</h3>
                    <p>${payment.tournament.name}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--accent);">KES ${payment.amount}</div>
                    <span class="status-badge status-pending">${payment.transactionCode}</span>
                </div>
            </div>
            <div class="payment-details">
                <div><strong>Phone:</strong> ${payment.phoneNumber}</div>
                <div><strong>Submitted:</strong> ${new Date(payment.submittedAt).toLocaleString()}</div>
                <img src="${API_URL}${payment.screenshotUrl}" alt="Screenshot" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px; float: right;">
            </div>
        </div>
    `).join('');
}

function openPaymentModal(paymentId) {
    currentPaymentId = paymentId;
    const payment = payments.find(p => p.id === paymentId);
    
    if (!payment) return;
    
    document.getElementById('modalTitle').textContent = `KES ${payment.amount} - ${payment.user.username}`;
    document.getElementById('modalContent').innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
            <div>
                <h3>Player: ${payment.user.username}</h3>
                <p><strong>Team:</strong> ${payment.user.teamName}</p>
                <p><strong>Tournament:</strong> ${payment.tournament.name}</p>
                <p><strong>Phone:</strong> ${payment.phoneNumber}</p>
                <p><strong>Code:</strong> <code>${payment.transactionCode}</code></p>
            </div>
            <div>
                <img src="${API_URL}${payment.screenshotUrl}" alt="M-Pesa SMS" style="width: 100%; max-width: 300px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2);">
            </div>
        </div>
        <div style="background: var(--darker); padding: 1rem; border-radius: 8px;">
            <strong>Platform fee (25%):</strong> KES ${Math.floor(payment.amount * 0.25)}<br>
            <strong>Prize pool (+75%):</strong> KES ${payment.amount - Math.floor(payment.amount * 0.25)}
        </div>
    `;
    
    document.getElementById('paymentModal').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
}

async function verifyPayment(paymentId) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/payments/admin/verify/${paymentId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            }
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showAlert(`Payment verified! Platform: KES ${data.platformFee}, Pool: KES ${data.prizePoolAdded}`, 'success');
            loadPendingPayments(); // Refresh
            closePaymentModal();
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showAlert('Verification failed: ' + error.message, 'error');
    }
}

async function rejectPayment(paymentId) {
    if (!confirm('Reject this payment?')) return;
    
    try {
        const token = localStorage.getItem('token');
        const reason = prompt('Reason for rejection (optional):');
        
        const res = await fetch(`${API_URL}/payments/admin/reject/${paymentId}`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({ reason })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showAlert('Payment rejected', 'success');
            loadPendingPayments();
            closePaymentModal();
        }
    } catch (error) {
        showAlert('Rejection failed', 'error');
    }
}

function updateStats() {
    const pending = payments.length;
    document.getElementById('pendingCount').textContent = pending;
    
    const todayTotal = payments.reduce((sum, p) => {
        const today = new Date().toDateString();
        return new Date(p.submittedAt).toDateString() === today ? sum + p.amount : sum;
    }, 0);
    
    const platformFee = Math.floor(todayTotal * 0.25);
    
    document.getElementById('todayRevenue').textContent = `KES ${todayTotal}`;
    document.getElementById('platformFee').textContent = `KES ${platformFee}`;
}

// Show alert
function showAlert(message, type = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; background: ${type === 'success' ? '#10b981' : '#ef4444'}; 
        color: white; padding: 1rem 1.5rem; border-radius: 8px; z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

