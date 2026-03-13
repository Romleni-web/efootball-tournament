const crypto = require('crypto');

class RoomGenerator {
  /**
   * Generate unique 6-char room ID (alphanumeric uppercase)
   */
  generateRoomId() {
    return crypto.randomBytes(3)
      .toString('hex')
      .toUpperCase()
      .substring(0, 6);
  }

  /**
   * Generate 4-digit numeric password
   */
  generatePassword() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  /**
   * Validate room ID format (6 uppercase alphanum)
   */
  isValidRoomId(roomId) {
    return /^[A-F0-9]{6}$/.test(roomId);
  }

  /**
   * Generate complete room session for match
   */
  generateRoomSession(player1GameId, player2GameId) {
    return {
      roomId: this.generateRoomId(),
      password: this.generatePassword(),
      player1GameId: player1GameId?.toUpperCase().trim() || null,
      player2GameId: player2GameId?.toUpperCase().trim() || null,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry
    };
  }

  /**
   * Check if room ID is likely unique (basic collision check)
   */
  async isRoomIdUnique(roomId, MatchModel) {
    const existing = await MatchModel.countDocuments({ 
      'gameSession.roomId': roomId,
      status: { $ne: 'completed' }
    });
    return existing === 0;
  }

  /**
   * Generate collision-free room ID
   */
  async generateUniqueRoomId(MatchModel) {
    let roomId;
    do {
      roomId = this.generateRoomId();
      const isUnique = await this.isRoomIdUnique(roomId, MatchModel);
    } while (!isUnique);
    
    return roomId;
  }
}

module.exports = new RoomGenerator();

