async function loadDashboard() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    document.getElementById('playerName').textContent = user.username || 'Player';
    
    try {
        // Load player stats
        const statsRes = await fetch(`${API_URL}/users/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const stats = await statsRes.json();
        
        document.getElementById('totalPoints').textContent = stats.points || 0;
        document.getElementById('totalWins').textContent = stats.wins || 0;
        document.getElementById('totalMatches').textContent = stats.matches || 0;
        
        // Load my tournaments
        const tourneysRes = await fetch(`${API_URL}/users/tournaments`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tournaments = await tourneysRes.json();
        
        const tourneysContainer = document.getElementById('myTournaments');
        if (tournaments.length > 0) {
            tourneysContainer.innerHTML = tournaments.map(t => `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--darker); border-radius: 8px; margin-bottom: 0.5rem;">
                    <div>
                        <div style="font-weight: 700;">${t.name}</div>
                        <div style="font-size: 0.9rem; color: var(--text-muted);">${t.status}</div>
                    </div>
                    <a href="matches.html?tournament=${t._id}" class="btn btn-outline btn-small">View</a>
                </div>
            `).join('');
        }
        
        // Load upcoming matches
        const matchesRes = await fetch(`${API_URL}/users/upcoming-matches`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const matches = await matchesRes.json();
        
        const matchesContainer = document.getElementById('upcomingMatches');
        if (matches.length > 0) {
            matchesContainer.innerHTML = matches.map(m => `
                <div style="padding: 1rem; background: var(--darker); border-radius: 8px; margin-bottom: 0.5rem; border-left: 3px solid var(--primary);">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                        <span style="font-weight: 700;">vs ${m.opponent}</span>
                        <span style="color: var(--primary);">${new Date(m.scheduledTime).toLocaleDateString()}</span>
                    </div>
                    <button onclick="openResultModal('${m._id}', '${m.opponent}')" class="btn btn-primary" style="width: 100%;">
                        Submit Result
                    </button>
                </div>
            `).join('');
        }
        
        // Load match history
        const historyRes = await fetch(`${API_URL}/users/match-history`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const history = await historyRes.json();
        
        const historyContainer = document.getElementById('matchHistory');
        if (history.length > 0) {
            historyContainer.innerHTML = history.map(h => `
                <div class="leaderboard-row">
                    <div>${new Date(h.date).toLocaleDateString()}</div>
                    <div>vs ${h.opponent}</div>
                    <div style="color: ${h.result === 'win' ? 'var(--accent)' : '#ff4444'}; font-weight: 700;">
                        ${h.myScore} - ${h.opponentScore}
                    </div>
                    <div style="color: var(--text-muted); text-transform: uppercase; font-size: 0.8rem;">
                        ${h.verified ? '✓ Verified' : '⏳ Pending'}
                    </div>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Dashboard load error:', error);
    }
}

function openResultModal(matchId, opponent) {
    document.getElementById('matchId').value = matchId;
    document.getElementById('opponentName').textContent = opponent;
    document.getElementById('resultModal').classList.add('active');
}

function closeResultModal() {
    document.getElementById('resultModal').classList.remove('active');
    document.getElementById('resultForm').reset();
}

async function submitMatchResult(e) {
    e.preventDefault();
    
    const token = localStorage.getItem('token');
    const formData = new FormData();
    formData.append('matchId', document.getElementById('matchId').value);
    formData.append('myScore', document.getElementById('myScore').value);
    formData.append('opponentScore', document.getElementById('opponentScore').value);
    formData.append('screenshot', document.getElementById('screenshot').files[0]);
    
    try {
        const response = await fetch(`${API_URL}/matches/submit-result`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        if (response.ok) {
            showAlert('Result submitted for verification!', 'success');
            closeResultModal();
            loadDashboard();
        } else {
            const data = await response.json();
            showAlert(data.message || 'Submission failed', 'error');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
    }
}
