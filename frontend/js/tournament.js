let currentTournamentId = null;

// Load live tournaments for homepage
async function loadLiveTournaments() {
    try {
        const response = await fetch(`${API_URL}/tournaments?status=ongoing&limit=3`);
        const tournaments = await response.json();
        
        const container = document.getElementById('live-tournaments');
        if (!container) return;
        
        container.innerHTML = tournaments.map(t => createTournamentCard(t)).join('');
    } catch (error) {
        console.error('Error loading tournaments:', error);
    }
}

// Load all tournaments
async function loadAllTournaments() {
    try {
        const response = await fetch(`${API_URL}/tournaments`);
        const tournaments = await response.json();
        
        const container = document.getElementById('tournaments-list');
        if (!container) return;
        
        container.innerHTML = tournaments.map(t => createTournamentCard(t)).join('');
    } catch (error) {
        console.error('Error loading tournaments:', error);
    }
}

// Create tournament card HTML
function createTournamentCard(tournament) {
    const isFull = tournament.registeredPlayers >= tournament.maxPlayers;
    const canJoin = tournament.status === 'open' && !isFull;
    
    return `
        <div class="tournament-card" data-status="${tournament.status}">
            <div class="tournament-header">
                <h3 class="tournament-name">${tournament.name}</h3>
                <span class="tournament-status status-${tournament.status}">${tournament.status}</span>
            </div>
            
            <div class="tournament-details">
                <div class="detail">
                    <span class="detail-label">Entry Fee</span>
                    <span class="detail-value">KES ${tournament.entryFee}</span>
                </div>
                <div class="detail">
                    <span class="detail-label">Prize Pool</span>
                    <span class="detail-value" style="color: var(--accent);">KES ${tournament.prizePool}</span>
                </div>
                <div class="detail">
                    <span class="detail-label">Players</span>
                    <span class="detail-value">${tournament.registeredPlayers}/${tournament.maxPlayers}</span>
                </div>
                <div class="detail">
                    <span class="detail-label">Format</span>
                    <span class="detail-value">${tournament.format || 'Single Elim'}</span>
                </div>
            </div>
            
            ${canJoin ? `
                <button class="btn btn-primary btn-large" style="width: 100%;" onclick="openPaymentModal('${tournament._id}', '${tournament.name}', ${tournament.entryFee})">
                    Join Tournament
                </button>
            ` : `
                <button class="btn btn-outline" style="width: 100%;" disabled>
                    ${isFull ? 'Tournament Full' : 'Registration Closed'}
                </button>
            `}
        </div>
    `;
}

// Filter tournaments
function filterTournaments(status) {
    document.querySelectorAll('.filter-bar button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === status || (status === 'all' && btn.textContent === 'All')) {
            btn.classList.add('active');
        }
    });
    
    const cards = document.querySelectorAll('.tournament-card');
    cards.forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}