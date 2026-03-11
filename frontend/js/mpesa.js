// M-Pesa Payment Integration
function openPaymentModal(tournamentId, name, amount) {
    currentTournamentId = tournamentId;
    document.getElementById('paymentTournamentName').textContent = name;
    document.getElementById('paymentAmount').textContent = `KES ${amount}`;
    document.getElementById('paymentModal').classList.add('active');
}

function closePaymentModal() {
    document.getElementById('paymentModal').classList.remove('active');
    currentTournamentId = null;
}

async function initiatePayment(e) {
    e.preventDefault();
    
    const phone = document.getElementById('mpesaNumber').value;
    const loading = document.getElementById('paymentLoading');
    const btnText = document.getElementById('paymentBtnText');
    
    // Show loading
    loading.classList.remove('hidden');
    btnText.textContent = 'Initiating...';
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/mpesa/stkpush`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                phoneNumber: phone,
                tournamentId: currentTournamentId
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            btnText.textContent = 'Check your phone...';
            showAlert('STK Push sent! Enter your M-Pesa PIN to complete payment.', 'success');
            
            // Poll for payment status
            pollPaymentStatus(data.checkoutRequestId);
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        loading.classList.add('hidden');
        btnText.textContent = 'Pay with M-Pesa';
        showAlert(error.message || 'Payment failed. Please try again.', 'error');
    }
}

async function pollPaymentStatus(checkoutRequestId) {
    const maxAttempts = 30;
    let attempts = 0;
    
    const interval = setInterval(async () => {
        attempts++;
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/mpesa/status/${checkoutRequestId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.status === 'completed') {
                clearInterval(interval);
                closePaymentModal();
                showAlert('Payment successful! You are now registered.', 'success');
                loadAllTournaments(); // Refresh to show joined status
            } else if (data.status === 'failed' || attempts >= maxAttempts) {
                clearInterval(interval);
                document.getElementById('paymentLoading').classList.add('hidden');
                document.getElementById('paymentBtnText').textContent = 'Pay with M-Pesa';
                
                if (data.status === 'failed') {
                    showAlert('Payment failed or cancelled.', 'error');
                } else {
                    showAlert('Payment timeout. Please check your M-Pesa messages.', 'error');
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }, 5000); // Check every 5 seconds
}
