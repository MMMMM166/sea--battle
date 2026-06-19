
const defaultConfig = require('../config/default');

class RoomManager {
  constructor(db) {
    this.rooms = new Map();
    this.db = db;
  }

  createRoom(customConfig = null) {
    const roomId = Math.random().toString(36).substring(2, 9).toUpperCase();
    
    const config = customConfig || {
      gridSize: defaultConfig.GRID_SIZE,
      ships: defaultConfig.SHIPS
    };

    const roomData = {
      id: roomId,
      players: new Map(),
      gameState: {
        phase: 'placement',
        turn: null
      },
      config: config,
      lastActivity: Date.now(),
      createdAt: Date.now()
    };

    this.rooms.set(roomId, roomData);

    this._saveRoomToDB(roomData).catch(err => {
      console.error('[RoomManager] Background save error:', err);
    });
    
    console.log(`[RoomManager] Created room: ${roomId}`);
    return roomId;
  }

  getRoom(roomId) {

    return this.rooms.get(roomId);
  }

  addPlayer(roomId, socketId, playerData) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    room.players.set(socketId, {
      id: socketId,
      name: playerData.name || 'Anonymous',
      ready: false,
      board: Array.from(
        { length: room.config.gridSize },
        () => Array(room.config.gridSize).fill(null)
      ),
      placedShips: {}
    });
    
    room.lastActivity = Date.now();
  }

  removePlayer(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.players.delete(socketId);
      room.lastActivity = Date.now();
    }
  }

  destroyRoom(roomId) {
    this.rooms.delete(roomId);

    if (this.db) {
      this.db.deleteRoom(roomId)
        .then(() => this.db.clearSessionsForRoom(roomId))
        .catch(err => {
          console.error('[RoomManager] Background delete error:', err);
        });
    }
    
    console.log(`[RoomManager] Destroyed room: ${roomId}`);
  }

validateShipPlacement(roomId, { shipId, row, col, size, vertical }) {
  const room = this.rooms.get(roomId);
  if (!room) return { valid: false, error: 'ROOM_NOT_FOUND' };

  const { board } = room.gameState;
  const rows = board.length;
  const cols = board[0].length;

  if (vertical) {
    if (row + size > rows) return { valid: false, error: 'OUT_OF_BOUNDS' };
  } else {
    if (col + size > cols) return { valid: false, error: 'OUT_OF_BOUNDS' };
  }

  for (let i = 0; i < size; i++) {
    const r = vertical ? row + i : row;
    const c = vertical ? col : col + i;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;

        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
          continue;
        }

        if (board[nr][nc] !== null && board[nr][nc] !== shipId) {
          return { valid: false, error: 'TOO_CLOSE_TO_OTHER_SHIP' };
        }
      }
    }
  }

  return { valid: true };
}

  removeShipFromBoard(roomId, shipId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const shipData = room.gameState.placedShips[shipId];
    if (!shipData) return;

    const { row, col, size, vertical } = shipData;

    for (let i = 0; i < size; i++) {
      const r = vertical ? row + i : row;
      const c = vertical ? col : col + i;
      room.gameState.board[r][c] = null;
    }

    delete room.gameState.placedShips[shipId];
    room.lastActivity = Date.now();

    this._saveRoomToDB(room).catch(err => {
      console.error('[RoomManager] Background save error:', err);
    });
  }

  async _saveRoomToDB(room) {
    if (!this.db) return;
    await this.db.saveRoom({
      roomId: room.id,
      config: room.config,
      players: Array
        .from(room.players.values())
        .map(player => ({
          id: player.id,
          name: player.name,
          ready: player.ready,
          board: player.board,
          placedShips: player.placedShips
        })),
      gameState: {
        phase: room.gameState.phase,
        turn: room.gameState.turn
      },
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    });
  }

  async saveMove(roomId, playerId, moveData) {
    const sessionId = `${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    const sessionData = {
      sessionId: sessionId,
      roomId: roomId,
      playerId: playerId,
      move: moveData,
      timestamp: Date.now()
    };
    
    try {
      await this.db.saveSession(sessionData);
      return sessionId;
    } catch (err) {
      console.error('[RoomManager] Error saving move:', err);
      throw err;
    }
  }
}

module.exports = RoomManager;