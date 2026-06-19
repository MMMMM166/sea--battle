class GameLogic {
    /**
     * @param {Object} placement - { shipId, row, col, size, vertical }
     * @param {Object} config - конфигурация поля
     * @param {Object} gameState - текущее состояние
     */
    static validatePlacement(placement, config, gameState) {
        const { row, col, size, vertical, shipId } = placement;
        const { GRID_SIZE, RULES } = config;
        const { board } = gameState;

        for (let i = 0; i < size; i++) {
        const r = vertical ? row + i : row;
        const c = vertical ? col : col + i;
        if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) {
            return { valid: false, error: 'OUT_OF_BOUNDS' };
        }
        if (board[r][c] !== null && board[r][c] !== shipId) {
            return { valid: false, error: 'CELL_OCCUPIED' };
        }
        }

        if (!RULES.allowTouch) {
        for (let i = 0; i < size; i++) {
            const r = vertical ? row + i : row;
            const c = vertical ? col : col + i;
            if (this._hasNeighbour(board, r, c, GRID_SIZE, shipId)) {
            return { valid: false, error: 'TOO_CLOSE_TO_OTHER_SHIP' };
            }
        }
        }

        return { valid: true };
    }

    static _hasNeighbour(board, row, col, gridSize, excludeShipId) {
        for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < gridSize && nc >= 0 && nc < gridSize) {
            const cell = board[nr][nc];
            if (cell !== null && cell !== excludeShipId) {
                return true;
            }
            }
        }
        }
        return false;
    }

    static createEmptyBoard(size) {
        return Array.from({ length: size }, () => Array(size).fill(null));
    }

    static countPlacedShips(gameState, config) {
        const shipSizes = new Map(config.SHIPS.map(s => [s.size, s.count]));
        const placed = {};

        for (const ship of Object.values(gameState.placedShips)) {
        placed[ship.size] = (placed[ship.size] || 0) + 1;
        }

        return {
        bySize: placed,
        total: Object.values(placed).reduce((a, b) => a + b, 0),
        required: config.SHIPS.reduce((sum, s) => sum + s.count, 0)
        };
    }
    }

module.exports = GameLogic;