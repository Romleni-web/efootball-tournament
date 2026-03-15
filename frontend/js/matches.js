const API_URL = 'https://efootball-tournament-1.onrender.com/api';

let currentMatchId = null;
let roomCheckInterval = null;

async function loadMatchDetails(matchId) {
    currentMatchId = matchId;
    const token = localStorage.getItem('token');
    
    try {
        const response = await fetch(`${API_URL}/matches/${matchId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            showAlert('Failed to load match', 'error');
            return;
        }
        
        const match = data.match;
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const isPlayer1 = match.player1._id === user._id || match.player1._id.toString() === user._id;
        const opponent = isPlayer1 ? match.player2 : match.player1;
        
        renderConnectionFlow(match, opponent);
        
    } catch (error) {
        console.error('Load match error:', error);
        showAlert('Failed to load match details', 'error');
    }
}

function renderConnectionFlow(match, opponent) {
    const container = document.getElementById('matchConnectionFlow');
    if (!container) return;
    
    const hasRoom = match.gameSession && match.gameSession.roomId;
    const isReady = match.status === 'ready';
    const isPlaying = match.status === 'playing';
    const isCompleted = match.status === 'completed';
    
    let html = `
        <div class="connection-flow">
            <!-- Step 1: Opponent Info -->
            <div class="flow-step ${hasRoom ? 'completed' : 'active'}">
                <div class="step-number">1</div>
                <div class="step-content">
                    <h3>Your Opponent</h3>
                    <div class="opponent-card">
                        <div class="opponent-avatar">${opponent.username[0].toUpperCase()}</div>
                        <div class="opponent-info">
                            <div class="opponent-name">${opponent.username}</div>
                            <div class="opponent-team">${opponent.teamName}</div>
                            ${opponent.gameId ? `<div class="game-id-display">Game ID: <span>${opponent.gameId}</span></div>` : '<div class="game-id-missing">⚠️ Game ID not set</div>'}
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Step 2: Generate Room -->
            <div class="flow-step ${hasRoom ? 'completed' : 'active'} ${hasRoom ? '' : 'pulse'}">
                <div class="step-number">2</div>
                <div class="step-content">
                    <h3>Generate Match Room</h3>
                    ${!hasRoom ? `
                        <p>Click below to generate room ID and password for your match.</p>
                        <button onclick="generateRoom('${match._id}')" class="btn btn-glow btn-large" id="generateRoomBtn">
                            <span>⚡</span> Generate Room
                        </button>
                    ` : `
                        <div class="room-details">
                            <div class="room-code">
                                <label>Room ID</label>
                                <div class="code-display" onclick="copyToClipboard('${match.gameSession.roomId}')">
                                    ${match.gameSession.roomId}
                                    <span class="copy-hint">📋 Click to copy</span>
                                </div>
                            </div>
                            <div class="room-password">
                                <label>Password</label>
                                <div class="code-display" onclick="copyToClipboard('${match.gameSession.roomPassword}')">
                                    ${match.gameSession.roomPassword}
                                    <span class="copy-hint">📋 Click to copy</span>
                                </div>
                            </div>
                        </div>
                        <div class="room-status ${isReady ? 'ready' : 'waiting'}">
                            ${isReady ? '✅ Both players ready!' : '⏳ Waiting for opponent...'}
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Step 3: In-Game Instructions -->
            <div class="flow-step ${hasRoom && isReady ? 'active' : ''} ${isPlaying || isCompleted ? 'completed' : ''}">
                <div class="step-number">3</div>
                <div class="step-content">
                    <h3>Connect in eFootball</h3>
                    <div class="game-instructions">
                        <ol>
                            <li>Open <strong>eFootball</strong> on your device</li>
                            <li>Go to <strong>Online → Friend Match → Search by Room ID</strong></li>
                            <li>Enter Room ID: <code>${match.gameSession?.roomId || '---'}</code></li>
                            <li>Enter Password: <code>${match.gameSession?.roomPassword || '---'}</code></li>
                            <li>Start the match!</li>
                        </ol>
                    </div>
                    ${isReady && !isPlaying && !isCompleted ? `
                        <button onclick="startMatch('${match._id}')" class="btn btn-primary btn-large">
                            I'm in the game! Start Match
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <!-- Step 4: Submit Result -->
            <div class="flow-step ${isPlaying ? 'active' : ''} ${isCompleted ? 'completed' : ''}">
                <div class="step-number">4</div>
                <div class="step-content">
                    <h3>Submit Result</h3>
                    ${isPlaying ? `
                        <p>After the match, upload a screenshot showing the final score.</p>
                        <button onclick="openResultModal('${match._id}', '${opponent.username}')" class="btn btn-accent btn-large">
                            Submit Match Result
                        </button>
                    ` : isCompleted ? `
                        <div class="result-submitted">
                            ✅ Result submitted and ${match.verifiedBy ? 'verified' : 'pending verification'}
                        </div>
                    ` : `
                        <p class="disabled-text">Complete the match first to submit results</p>
                    `}
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    if (hasRoom && !isReady && !isPlaying && !isCompleted) {
        startRoomPolling(match._id);
    }
}

async function generateRoom(matchId) {
    const btn = document.getElementById('generateRoomBtn');
    btn.innerHTML = '<span class="loading"></span> Generating...';
    btn.disabled = true;
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/matches/${matchId}/generate-room`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showAlert('Room generated! Share these details with your opponent.', 'success');
            loadMatchDetails(matchId);
        } else {
            showAlert(data.message || 'Failed to generate room', 'error');
            btn.innerHTML = '<span>⚡</span> Generate Room';
            btn.disabled = false;
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
        btn.innerHTML = '<span>⚡</span> Generate Room';
        btn.disabled = false;
    }
}

function startRoomPolling(matchId) {
    if (roomCheckInterval) clearInterval(roomCheckInterval);
    
    roomCheckInterval = setInterval(async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/matches/${matchId}/room-info`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            
            if (data.success && data.room.bothReady) {
                clearInterval(roomCheckInterval);
                showAlert('🎉 Opponent is ready! You can now start the match.', 'success');
                loadMatchDetails(matchId);
            }
        } catch (error) {
            console.error('Room polling error:', error);
        }
    }, 5000);
}

async function startMatch(matchId) {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/matches/${matchId}/start-playing`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            showAlert('Match started! Good luck! ⚽', 'success');
            loadMatchDetails(matchId);
        }
    } catch (error) {
        showAlert('Failed to start match', 'error');
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!', 'success');
    });
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
            loadMatchDetails(currentMatchId);
        } else {
            const data = await response.json();
            showAlert(data.message || 'Submission failed', 'error');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
    }
}

function showAlert(message, type = 'info') {
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    alert.style.position = 'fixed';
    alert.style.top = '80px';
    alert.style.right = '20px';
    alert.style.zIndex = '3000';
    alert.style.maxWidth = '300px';
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
        alert.remove();
    }, 3000);
}

window.addEventListener('beforeunload', () => {
    if (roomCheckInterval) clearInterval(roomCheckInterval);
});