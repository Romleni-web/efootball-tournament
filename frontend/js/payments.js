// Manual Payment Flow (Spec Step 3) - join-tournament.html
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tournamentId = urlParams.get('tournament');
    const fee = parseInt(urlParams.get('fee')) || 0;
    const name = decodeURIComponent(urlParams.get('name') || '');
    
    if (tournamentId) {
        document.getElementById('tournamentId').value = tournamentId;
        document.getElementById('paymentAmount').textContent = `KES ${fee}`;
        document.getElementById('tournamentName').textContent = name;
    }
});

async function submitManualPayment(event) {
    event.preventDefault();
    
    const formData = new FormData();
    formData.append('tournamentId', document.getElementById('tournamentId').value);
    formData.append('amount', document.getElementById('paymentAmount').textContent.replace('KES ', ''));
    formData.append('transactionCode', document.getElementById('transactionCode').value);
    formData.append('mpesaNumber', document.getElementById('mpesaNumber').value);
    formData.append('screenshot', document.getElementById('screenshot').files[0]);
    
    const loading = document.getElementById('submitLoading');
    loading.classList.remove('hidden');
    
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/payments/manual-submit`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await res.json();
        
        if (res.ok) {
            showAlert('Payment submitted! Awaiting admin verification.', 'success');
            setTimeout(() => window.location.href = 'dashboard.html', 2000);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        loading.classList.add('hidden');
    }
}

