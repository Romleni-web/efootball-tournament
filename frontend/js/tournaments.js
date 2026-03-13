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

// UCL Bracket Functions
function showBracket(tournamentId, tournamentName, status) {
    document.getElementById('bracketTournamentName').textContent = tournamentName;
    document.getElementById('bracketStatus').textContent = status.toUpperCase();
    document.getElementById('bracketModal').classList.remove('hidden');
    document.getElementById('bracketModal').classList.add('active');
    
    renderUCLBracket(tournamentId);
}

function closeBracketModal() {
    document.getElementById('bracketModal').classList.add('hidden');
    document.getElementById('bracketModal').classList.remove('active');
}

async function renderUCLBracket(tournamentId) {
    // Mock UCL bracket data - replace with real API call later
    const mockBracket = {
        roundOf16: [
            {team1: 'Real Madrid', team2: 'Manchester City', score1: 2, score2: 1, winner: 'team1'},
            {team1: 'Bayern Munich', team2: 'Arsenal', score1: 3, score2: 0, winner: 'team1'},
            {team1: 'PSG', team2: 'Barcelona', score1: 1, score2: 4, winner: 'team2'},
            {team1: 'Liverpool', team2: 'Inter Milan', score1: 0, score2: 2, winner: 'team2'},
            {team1: 'Juventus', team2: 'Dortmund', score1: 1, score2: 0, winner: 'team1'},
            {team1: 'Atletico Madrid', team2: 'Leverkusen', score1: 2, score2: 2, winner: 'team1'},
            {team1: 'Chelsea', team2: 'Porto', score1: 3, score2: 1, winner: 'team1'},
            {team1: 'Napoli', team2: 'Ajax', score1: 0, score2: 2, winner: 'team2'}
        ],
        quarters: [
            {team1: 'Real Madrid', team2: 'Bayern Munich', score1: 2, score2: 1, winner: 'team1'},
            {team1: 'Barcelona', team2: 'Inter Milan', score1: 1, score2: 0, winner: 'team1'},
            {team1: 'Juventus', team2: 'Atletico Madrid', score1: 0, score2: 2, winner: 'team2'},
            {team1: 'Chelsea', team2: 'Ajax', score1: 3, score2: 1, winner: 'team1'}
        ],
        semis: [
            {team1: 'Real Madrid', team2: 'Barcelona', score1: 4, score2: 2, winner: 'team1'},
            {team1: 'Atletico Madrid', team2: 'Chelsea', score1: 1, score2: 0, winner: 'team1'}
        ],
        final: {team1: 'Real Madrid', team2: 'Atletico Madrid', score1: 2, score2: 0, winner: 'team1'}
    };

    const svg = document.getElementById('bracketSvg');
    svg.innerHTML = '';

    // Dimensions
    const width = 1400, height = 800;
    const leftMargin = 50, topMargin = 50;
    const slotWidth = 140, slotHeight = 40;
    const lineSpacing = 80;

    // Helper to create team text
    function createTeamText(x, y, team, isWinner = false) {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('class', `team-slot ${isWinner ? 'winner' : ''}`);
        text.setAttribute('font-size', '14');
        text.textContent = team;
        return text;
    }

    // Helper to create score
    function createScore(x, y, score1, score2) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const score1Text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        score1Text.setAttribute('x', x - 20);
        score1Text.setAttribute('y', y);
        score1Text.setAttribute('class', 'score');
        score1Text.textContent = score1;
        const score2Text = score1Text.cloneNode();
        score2Text.setAttribute('x', x + 20);
        score2Text.textContent = score2;
        g.appendChild(score1Text);
        g.appendChild(score2Text);
        return g;
    }

    // Round of 16 (left side)
    let currentY = topMargin + lineSpacing * 1.5;
    mockBracket.roundOf16.forEach((match, i) => {
        const x1 = leftMargin, x2 = leftMargin + 120;
        const midY = currentY + slotHeight/2;
        
        // Teams
        svg.appendChild(createTeamText(x1, currentY + slotHeight/2, match.team1));
        svg.appendChild(createTeamText(x2, currentY + slotHeight/2, match.team2));
        
        // Score
        svg.appendChild(createScore(x1 + 60, currentY + slotHeight/2 + 25, match.score1, match.score2));
        
        // Vertical line to next round
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', leftMargin + 120);
        line.setAttribute('y1', midY);
        line.setAttribute('x2', 250);
        line.setAttribute('y2', midY);
        line.setAttribute('class', 'match-line');
        line.style.animationDelay = `${i * 0.1}s`;
        svg.appendChild(line);
        
        currentY += lineSpacing;
    });

    // Quarter Finals
    currentY = topMargin + lineSpacing * 1.5;
    mockBracket.quarters.forEach((match, i) => {
        const x1 = 300, x2 = 300 + 120;
        const midY = currentY + slotHeight/2;
        
        svg.appendChild(createTeamText(x1, currentY + slotHeight/2, match.team1));
        svg.appendChild(createTeamText(x2, currentY + slotHeight/2, match.team2));
        svg.appendChild(createScore(x1 + 60, currentY + slotHeight/2 + 25, match.score1, match.score2));
        
        // Line to semis
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x2);
        line.setAttribute('y1', midY);
        line.setAttribute('x2', 500);
        line.setAttribute('y2', midY);
        line.setAttribute('class', 'match-line');
        line.style.animationDelay = `0.${(i+8)}s`;
        svg.appendChild(line);
        
        currentY += lineSpacing * 2;
    });

    // Semi Finals
    currentY = topMargin + lineSpacing * 2.5;
    mockBracket.semis.forEach((match, i) => {
        const x1 = 550, x2 = 550 + 120;
        const midY = currentY + slotHeight/2;
        
        svg.appendChild(createTeamText(x1, currentY + slotHeight/2, match.team1));
        svg.appendChild(createTeamText(x2, currentY + slotHeight/2, match.team2));
        svg.appendChild(createScore(x1 + 60, currentY + slotHeight/2 + 25, match.score1, match.score2));
        
        // Line to final
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x2);
        line.setAttribute('y1', midY);
        line.setAttribute('x2', 800);
        line.setAttribute('y2', height/2);
        line.setAttribute('class', 'match-line');
        line.style.animationDelay = `0.${(i+12)}s`;
        svg.appendChild(line);
        
        currentY += lineSpacing * 3;
    });

    // Final
    const finalX1 = 900, finalX2 = 900 + 120;
    const finalY = height/2;
    svg.appendChild(createTeamText(finalX1, finalY, mockBracket.final.team1, true));
    svg.appendChild(createTeamText(finalX2, finalY, mockBracket.final.team2, true));
    svg.appendChild(createScore(finalX1 + 60, finalY + 25, mockBracket.final.score1, mockBracket.final.score2));

    // Trophy
    const trophy = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    trophy.setAttribute('class', 'final-trophy');
    trophy.innerHTML = `
        <path d="M 1150 350 L 1200 320 L 1250 350 L 1240 380 L 1210 370 L 1190 390 L 1160 370 L 1130 380 Z" transform="scale(0.8)"/>
        <circle cx="1200" cy="310" r="15" fill="#ffd700" stroke="#ff6b35" stroke-width="3"/>
        <path d="M 1180 295 L 1220 295 Q 1200 280 1180 295" fill="none" stroke="#ff6b35" stroke-width="4" stroke-linecap="round"/>
    `;
    svg.appendChild(trophy);

    // Round labels
    const labels = [
        {text: 'Round of 16', x: 150, y: 40},
        {text: 'Quarter Finals', x: 380, y: 40},
        {text: 'Semi Finals', x: 580, y: 40},
        {text: 'FINAL', x: 980, y: 40}
    ];
    labels.forEach(label => {
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', label.x);
        text.setAttribute('y', label.y);
        text.setAttribute('class', 'round-label');
        text.setAttribute('font-size', '16');
        text.textContent = label.text;
        svg.appendChild(text);
    });
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
