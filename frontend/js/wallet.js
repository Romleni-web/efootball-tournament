const WalletApp = {
    API_URL: 'https://efootball-tournament-1.onrender.com/api',
    
    async loadWallet() {
        const token = localStorage.getItem('token');
        if (!token) return;
        
        try {
            const res = await fetch(`${this.API_URL}/payments/wallet`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (data.success) {
                document.getElementById('mainBalance').textContent = data.wallet.balance.toLocaleString() + ' KES';
                document.getElementById('withdrawAvailable').textContent = data.wallet.balance.toLocaleString() + ' KES';
                
                document.getElementById('totalWon').textContent = data.wallet.totalWon.toLocaleString();
                document.getElementById('totalLost').textContent = data.wallet.totalLost.toLocaleString();
                document.getElementById('totalDeposited').textContent = data.wallet.totalDeposited.toLocaleString();
                document.getElementById('totalWithdrawn').textContent = data.wallet.totalWithdrawn.toLocaleString();
                
                this.renderTransactions(data.transactions);
            }
        } catch (error) {
            console.error('Wallet load error:', error);
        }
    },
    
    renderTransactions(transactions) {
        const container = document.getElementById('transactionsList');
        if (transactions.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 2rem;">No transactions yet</p>';
            return;
        }
        
        container.innerHTML = transactions.map(t => `
            <div class="transaction-item">
                <div class="transaction-type">
                    <div class="type-icon ${t.direction}">${t.direction === 'in' ? '↓' : '↑'}</div>
                    <div>
                        <div style="font-weight: 600;">${t.description}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">
                            ${new Date(t.date).toLocaleDateString()}
                        </div>
                    </div>
                </div>
                <div class="transaction-amount ${t.direction}">
                    ${t.direction === 'in' ? '+' : '-'}${t.amount} KES
                </div>
            </div>
        `).join('');
    },
    
    async submitWithdrawal() {
        const amount = parseInt(document.getElementById('withdrawAmount').value);
        const phone = document.getElementById('withdrawPhone').value.trim();
        
        if (!amount || amount < 100) {
            alert('Minimum withdrawal is 100 KES');
            return;
        }
        
        if (!/^2547\\d{8}$/.test(phone)) {
            alert('Enter valid M-Pesa number: 2547XXXXXXXX');
            return;
        }
        
        const token = localStorage.getItem('token');
        
        try {
            const res = await fetch(`${this.API_URL}/payments/withdraw`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ amount, phone })
            });
            
            const data = await res.json();
            
            if (res.ok) {
                alert('Withdrawal requested successfully!');
                document.getElementById('withdrawForm').reset();
                this.loadWallet();
            } else {
                alert(data.message || 'Withdrawal failed');
            }
        } catch (error) {
            alert('Network error. Please try again.');
            console.error('Withdrawal error:', error);
        }
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    WalletApp.loadWallet();
    
    document.getElementById('withdrawForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        WalletApp.submitWithdrawal();
    });
});

async function requestWithdraw(event) {
    event.preventDefault();
    
    const amount = parseInt(document.getElementById('withdrawAmount').value);
    const mpesaNumber = document.getElementById('mpesaNumber').value;
    const loading = document.getElementById('withdrawLoading');
    
    if (amount < 100) {
        showAlert('Minimum withdrawal is KES 100', 'error');
        return;
    }

    loading.classList.remove('hidden');
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/users/withdraw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ amount, mpesaNumber })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showAlert('Withdrawal request submitted! Admin will process within 24 hours.', 'success');
            document.getElementById('withdrawForm').reset();
            loadWallet(); // Refresh balance
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showAlert('Withdrawal failed: ' + error.message, 'error');
    } finally {
        loading.classList.add('hidden');
    }
}

function displayTransactions(payments) {
    const container = document.getElementById('transactionHistory');
    container.innerHTML = payments.map(p => `
        <div class="transaction-item" style="display: flex; justify-content: space-between; padding: 1rem; border-bottom: 1px solid var(--border);">
            <div>
                <div style="font-weight: 600;">${p.tournament?.name || 'Prize'}</div>
                <div style="color: var(--text-muted); font-size: 0.9rem;">${new Date(p.createdAt).toLocaleDateString()}</div>
            </div>
            <div style="text-align: right;">
                <div style="font-size: 1.2rem; font-weight: 700; color: ${p.status === 'completed' ? 'var(--accent)' : 'var(--danger)'};">
                    ${p.status === 'completed' ? '+' : '-'}${p.amount}
                </div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">${p.status.toUpperCase()}</div>
            </div>
        </div>
    `).join('');
}

// Show alert helper
function showAlert(message, type = 'info') {
    // Create toast notification
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white; border-radius: 8px; z-index: 10000; transform: translateX(400px);
        transition: transform 0.3s ease;
    `;
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => toast.style.transform = 'translateX(0)', 100);
    
    // Auto remove
    setTimeout(() => {
        toast.style.transform = 'translateX(400px)';
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 4000);
}

