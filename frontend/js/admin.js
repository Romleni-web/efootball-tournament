let currentMatchId = null;

function checkAdminAuth() {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (!user.isAdmin) {
        window.location.href = 'index.html';
    }
}

function showSection(section) {
    document.querySelectorAll('section').forEach(s => s.style.display = 'none');
    document.getElementById(`${section}-section`).style.display = 'block';
    
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    event.target.classList.add('active');
    
    if (section === 'matches') loadPendingMatches();
    if (section === 'tournaments') loadAdminTournaments();
    if (section === 'payments') loadPayments();
}

async function loadAdminData() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        document.getElementById('adminTotalUsers').textContent = data.totalUsers;
        document.getElementById('adminActiveTournaments').textContent = data.activeTournaments;
        document.getElementById('adminPendingVerifications').textContent = data.pendingVerifications;
        document.getElementById('adminRevenue').textContent = `KES ${data.totalRevenue.toLocaleString()}`;
    } catch (error) {
        console.error('Admin load error:', error);
    }
}

function openCreateTournamentModal() {
    document.getElementById('createTournamentModal').classList.add('active');
}

function closeCreateTournamentModal() {
    document.getElementById('createTournamentModal').classList.remove('active');
}

async function createTournament(e) {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const tournamentData = {
        name: document.getElementById('tournamentName').value,
        entryFee: parseInt(document.getElementById('entryFee').value),
        maxPlayers: parseInt(document.getElementById('maxPlayers').value),
        prizePool: parseInt(document.getElementById('prizePool').value),
        startDate: document.getElementById('startDate').value
    };
    
    try {
        const response = await fetch(`${API_URL}/admin/tournaments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(tournamentData)
        });
        
        if (response.ok) {
            showAlert('Tournament created successfully!', 'success');
            closeCreateTournamentModal();
            loadAdminData();
        } else {
            const data = await response.json();
            showAlert(data.message || 'Failed to create tournament', 'error');
        }
    } catch (error) {
        showAlert('Network error', 'error');
    }
}

async function loadPendingMatches() {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/pending-matches`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const matches = await response.json();
        
        const container = document.getElementById('pendingMatches');
        if (matches.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">No pending verifications</p>';
            return;
        }
        
        container.innerHTML = matches.map(m => `
            <div style="background: var(--darker); border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem; border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <div style="font-weight: 700; font-size: 1.2rem;">${m.player1} vs ${m.player2}</div>
                        <div style="color: var(--text-muted);">${m.tournamentName}</div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-family: var(--font-display); font-size: 1.5rem; color: var(--primary);">
                            ${m.score1} - ${m.score2}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">Submitted by ${m.submittedBy}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button onclick="viewScreenshot('${m._id}', '${m.screenshotUrl}')" class="btn btn-outline" style="flex: 1;">
                        View Screenshot
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Load matches error:', error);
    }
}

function viewScreenshot(matchId, url) {
    currentMatchId = matchId;
    document.getElementById('screenshotPreview').src = url;
    document.getElementById('screenshotModal').classList.add('active');
}

function closeScreenshotModal() {
    document.getElementById('screenshotModal').classList.remove('active');
    currentMatchId = null;
}

async function approveMatch() {
    await verifyMatch('approved');
}

async function rejectMatch() {
    await verifyMatch('rejected');
}

async function verifyMatch(status) {
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/admin/verify-match/${currentMatchId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });
        
        if (response.ok) {
            showAlert(`Match ${status} successfully`, 'success');
            closeScreenshotModal();
            loadPendingMatches();
            loadAdminData();
        }
    } catch (error) {
        showAlert('Verification failed', 'error');
    }
}
