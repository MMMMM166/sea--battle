let socket;
let GRID_SIZE = 10;
let SHIPS_DEF = [];
let board = []; // тут shipId или null
let placedShips = {}; // row, col, size, vertical
let myRoomId = null;
let dragShipId = null;
let dragVertical = false;
let isRoomOwner = false;
let enemyBoard = [];
let myTurn = false;
const enemyShots = new Set(); // чтобы не стрелять дважды

// загружаем конфиг с сервера
async function fetchConfigAndInit() {
    try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error('Server error: ' + res.status);
        const data = await res.json();

        GRID_SIZE = data.gridSize;
        SHIPS_DEF = data.ships;

        buildBoard();
        buildDock();
        buildEnemyBoard();
        console.log('Config loaded:', GRID_SIZE, 'x', GRID_SIZE);
    } catch (err) {
        console.error('Failed to load config:', err);
        alert('Ошибка загрузки конфигурации игры! Проверьте консоль сервера.');
    }
}

// поле противника
function buildEnemyBoard() {
    const boardEl = document.getElementById('enemyBoard');
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 40px)`;
    boardEl.style.gridTemplateRows = `repeat(${GRID_SIZE}, 40px)`;
    
    enemyBoard = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.addEventListener('click', onEnemyCellClick);
            boardEl.appendChild(cell);
        }
    }
}

// клик по полю врага
function onEnemyCellClick(e) {
    if (!myTurn) {
        console.log('ENEMY CELL CLICK');
        alert('Сейчас ход противника');
        return;
    }

    const row = Number(e.target.dataset.row);
    const col = Number(e.target.dataset.col);
    const key = `${row}-${col}`;

    // уже стреляли сюда
    if (enemyShots.has(key)) {
        alert('По этой клетке уже стреляли');
        return;
    }

    // стреляем
    socket.emit('shoot', {
        roomId: myRoomId,
        row,
        col
    });
}

// индикатор чей ход
function updateTurnIndicator(text, myTurnFlag) {
    const el = document.getElementById('turnIndicator');
    if (!el) return;

    el.textContent = text;
    el.classList.remove('turn-my', 'turn-enemy');
    el.classList.add(myTurnFlag ? 'turn-my' : 'turn-enemy');
}

// подключение к сокету
function connectWebSocket() {
    const statusEl = document.getElementById('connection-status');
    console.log('Connecting to WebSocket...');
    
    socket = io('http://localhost:3002', {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5
    });

    socket.on('connect', () => {
        console.log('Socket connected, ID:', socket.id);
        if (statusEl) {
            statusEl.textContent = 'Статус: Подключено';
            statusEl.classList.add('connected');
        }
        joinGame();
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
        if (statusEl) {
            statusEl.textContent = 'Статус: Отключено';
            statusEl.classList.remove('connected');
        }
    });

    socket.on('connect_error', (err) => {
        console.error('Connection error:', err.message);
        if (statusEl) statusEl.textContent = 'Ошибка подключения';
    });

    socket.on('player_joined', (data) => {
        console.log('Player joined:', data);
    });

    // обновление состояния доски
    socket.on('game_update', (data) => {
        console.log('Game update received');
        if (data && data.state) {
            applyBoardState(data.state);
        }
    });

    // мой ход
    socket.on('your_turn', () => {
        myTurn = true;
        updateTurnIndicator('Ваш ход', true);
        console.log('RECEIVED YOUR TURN');
    });

    // ход противника
    socket.on('enemy_turn', () => {
        myTurn = false;
        updateTurnIndicator('Ход соперника', false);
        console.log('RECEIVED ENEMY TURN');
    });

    socket.on('room_closed', (data) => {
        alert('Комната уничтожена.');
        window.location.href = window.location.pathname;
    });

    socket.on('player_left', (data) => {
        console.log('Player left:', data);
        alert('Соперник покинул игру');
    });

    // результат моего выстрела
    socket.on('shot_result', data => {
        const key = `${data.row}-${data.col}`;
        enemyShots.add(key);

        const cells = document.querySelectorAll('#enemyBoard .cell');
        cells.forEach(cell => {
            const row = +cell.dataset.row;
            const col = +cell.dataset.col;

            if (row === data.row && col === data.col) {
                if (data.hit) {
                    cell.classList.add('hit');
                    cell.textContent = '✖';
                } else {
                    cell.classList.add('miss');
                    cell.textContent = '•';
                }
            }
        });

        myTurn = false; // ход передан
    });

    // по мне стреляют
    socket.on('enemy_shot', data => {
        const cells = document.querySelectorAll('#board .cell');
        cells.forEach(cell => {
            const row = +cell.dataset.row;
            const col = +cell.dataset.col;

            if (row === data.row && col === data.col) {
                if (data.hit) {
                    cell.classList.add('hit');
                    cell.textContent = '✖';
                } else {
                    cell.classList.add('miss');
                    cell.textContent = '•';
                }
            }
        });

        myTurn = true; // теперь мой ход
    });

    // смена фазы игры
    socket.on('game_phase_changed', (data) => {
        console.log('Phase changed:', data);
        if (data.phase === 'battle') {
            document.getElementById('enemyBoardWrapper').style.display = 'flex';
            alert(data.message || 'Бой начинается!');
            
            const dock = document.getElementById('dock');
            if (dock) dock.style.display = 'none';
            
            const btnConfirm = document.getElementById('btnConfirm');
            const btnInvite = document.getElementById('btnInvite');
            
            if (btnConfirm) {
                btnConfirm.textContent = 'В бою!';
                btnConfirm.disabled = true;
            }
            
            // кнопка приглашения
            if (btnInvite) {
                btnInvite.addEventListener('click', async () => {
                    if (!myRoomId) {
                        alert('Комната ещё не создана');
                        return;
                    }
                    const inviteLink = `${window.location.origin}?room=${myRoomId}`;
                    try {
                        await navigator.clipboard.writeText(inviteLink);
                        alert('Ссылка скопирована:\n\n' + inviteLink);
                    } catch {
                        prompt('Скопируйте ссылку:', inviteLink);
                    }
                });
            }
        }
    });
}

// вход в игру
function joinGame() {
    console.log('ЗАПУСК joinGame');
    const urlParams = new URLSearchParams(window.location.search);
    const roomIdFromUrl = urlParams.get('room');

    const payload = {
        playerName: 'Player-' + Math.floor(Math.random() * 1000)
    };

    if (roomIdFromUrl) {
        payload.roomId = roomIdFromUrl;
    }

    socket.emit('join', payload, (err, response) => {
        console.log('<<< ПОЛУЧЕН ОТВЕТ ЧЕРЕЗ КОЛБЭК');
        console.log('Err:', err, 'Response:', response);

        if (err) {
            console.error('Join error:', err);
            alert('Ошибка входа: ' + (err.message || JSON.stringify(err)));
            return;
        }

        if (response && response.roomId) {
            myRoomId = response.roomId;
            isRoomOwner = !roomIdFromUrl;
            console.log('УСПЕХ: myRoomId установлен в', myRoomId);

            updateRoomUI(myRoomId);

            if (response.state) {
                restoreState(response.state);
            }

            // чтобы при обновлении страницы не терять комнату
            window.history.pushState({}, '', '?room=' + myRoomId);
        } else {
            console.error('Некорректный ответ от сервера:', response);
            alert('Сервер вернул пустой ответ при входе в комнату.');
        }
    });
}

function updateRoomUI(roomId) {
    const roomInfoEl = document.getElementById('room-info');
    if (roomInfoEl) {
        roomInfoEl.textContent = 'Комната: ' + roomId;
    }
}

// строим мое поле
function buildBoard() {
    const boardEl = document.getElementById('board');
    if (!boardEl) return;
    
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = 'repeat(' + GRID_SIZE + ', 40px)';
    boardEl.style.gridTemplateRows = 'repeat(' + GRID_SIZE + ', 40px)';

    board = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));

    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            // drag over - подсветка
            cell.addEventListener('dragover', e => {
                e.preventDefault();

                if (!dragShipId) return;

                const row = +cell.dataset.row;
                const col = +cell.dataset.col;

                let baseId = dragShipId;
                const parts = dragShipId.split('-');
                if (parts.length > 2) {
                    baseId = parts[0] + '-' + parts[1];
                }
                const shipDef = SHIPS_DEF.find(s => s.id === baseId);

                if (!shipDef) return;

                const isValid = canPlaceShip(row, col, shipDef.size, dragVertical);

                if (isValid) {
                    cell.classList.add('drag-over-valid');
                    cell.classList.remove('drag-over-invalid');
                } else {
                    cell.classList.add('drag-over-invalid');
                    cell.classList.remove('drag-over-valid');
                }
            });

            cell.addEventListener('dragleave', () => {
                cell.classList.remove('drag-over');
                cell.classList.remove('drag-over-valid');
                cell.classList.remove('drag-over-invalid');
            });

            cell.addEventListener('drop', onDrop);
            cell.addEventListener('dblclick', onCellDblClick);

            boardEl.appendChild(cell);
        }
    }
}

// док с кораблями
function buildDock() {
    const dock = document.getElementById('dock');
    if (!dock) return;
    dock.innerHTML = '';
    
    SHIPS_DEF.forEach(def => {
        for (let i = 0; i < def.count; i++) {
            const uid = def.id + (i === 0 ? '' : '-' + i);
            const el = document.createElement('div');
            el.className = 'ship-preview';
            el.dataset.shipId = uid;
            el.dataset.size = def.size;
            el.dataset.vertical = 'false';
            el.draggable = true;

            // блоки корабля
            for (let b = 0; b < def.size; b++) {
                const block = document.createElement('div');
                block.className = 'block';
                el.appendChild(block);
            }

            el.addEventListener('dragstart', onDragStart);
            
            // двойной клик - поворот
            el.addEventListener('dblclick', () => {
                const v = el.dataset.vertical === 'true';
                el.dataset.vertical = String(!v);
                el.classList.toggle('vertical', !v);
            });

            dock.appendChild(el);
        }
    });
}

// начали тащить корабль
function onDragStart(e) {
    const shipEl = e.target.closest('.ship-preview');
    if (!shipEl) return;
    dragShipId = shipEl.dataset.shipId;
    dragVertical = shipEl.dataset.vertical === 'true';
    console.log('Drag start:', dragShipId, 'vertical:', dragVertical);
}

// бросили корабль на поле
function onDrop(e) {
    e.preventDefault();
    const cell = e.target.closest('.cell');
    if (cell) {
        cell.classList.remove('drag-over');
        cell.classList.remove('drag-over-valid');
        cell.classList.remove('drag-over-invalid');
    }
    if (!cell || !dragShipId) return;

    const row = +cell.dataset.row;
    const col = +cell.dataset.col;

    let baseId = dragShipId;
    const parts = dragShipId.split('-');
    if (parts.length > 2) {
        baseId = parts[0] + '-' + parts[1];
    }

    const shipDef = SHIPS_DEF.find(s => s.id === baseId);

    if (!shipDef) {
        console.error('Ship definition not found for baseId:', baseId, 'from dragShipId:', dragShipId);
        alert('Ошибка: Не найдено определение корабля.');
        return;
    }

    // проверка что можно ставить
    if (!canPlaceShip(row, col, shipDef.size, dragVertical)) {
        alert('Нельзя ставить корабль вплотную к другому! Минимум 1 клетка между кораблями.');
        return;
    }

    // сохраняем
    placedShips[dragShipId] = {
        row,
        col,
        size: shipDef.size,
        vertical: dragVertical
    };

    // заполняем доску
    for (let i = 0; i < shipDef.size; i++) {
        const r = dragVertical ? row + i : row;
        const c = dragVertical ? col : col + i;
        board[r][c] = dragShipId;
    }

    renderBoard();
    updateDockState();
}

// можно ли поставить корабль
function canPlaceShip(row, col, size, vertical) {
    const rows = GRID_SIZE;
    const cols = GRID_SIZE;
    
    for (let i = 0; i < size; i++) {
        const r = vertical ? row + i : row;
        const c = vertical ? col : col + i;

        if (r >= rows || c >= cols) {
            return false;
        }

        // проверяем соседние клетки
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;

                if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
                    continue;
                }

                if (board[nr][nc] !== null && board[nr][nc] !== dragShipId) {
                    return false;
                }
            }
        }
    }

    return true;
}

// отправка расстановки на сервер (пока не используется напрямую)
function sendPlaceShipRequest(shipId, row, col, size, vertical) {
    if (!myRoomId) {
        alert('Ошибка: Комната не найдена. Обновите страницу.');
        return;
    }
    const payload = {
        roomId: myRoomId,
        shipId: shipId,
        row: row,
        col: col,
        size: size,
        vertical: vertical
    };

    socket.emit('place_ship', payload, (response) => {
        if (response?.error) {
            let errorMsg = 'Не удалось разместить корабль';

            switch (response.error) {
                case 'TOO_CLOSE_TO_OTHER_SHIP':
                    errorMsg = 'Корабль слишком близко к другому! Минимум 1 клетка между ними.';
                    break;
                case 'CELL_OCCUPIED':
                    errorMsg = 'Эта клетка уже занята!';
                    break;
                case 'OUT_OF_BOUNDS':
                    errorMsg = 'Корабль выходит за границы поля!';
                    break;
                default:
                    errorMsg += ': ' + response.error;
            }

            alert(errorMsg);
        } else {
            console.log('Ship placed successfully');
        }
    });
}

// удаление корабля с поля (двойной клик)
function onCellDblClick(e) {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    
    const r = +cell.dataset.row;
    const c = +cell.dataset.col;
    const shipId = board[r][c];
    if (!shipId) return;
    
    const ship = placedShips[shipId];
    if (!ship) return;
    
    // очищаем клетки
    for (let i = 0; i < ship.size; i++) {
        const rr = ship.vertical ? ship.row + i : ship.row;
        const cc = ship.vertical ? ship.col : ship.col + i;
        board[rr][cc] = null;
    }
    
    delete placedShips[shipId];
    renderBoard();
    updateDockState();
}

// применяем состояние с сервера
function applyBoardState(state) {
    if (!state) return;
    if (state.board) {
        board = state.board.map(row => [...row]);
    }
    if (state.placedShips) {
        placedShips = { ...state.placedShips };
    }
    renderBoard();
    updateDockState();
}

function restoreState(state) {
    applyBoardState(state);
}

// рендер доски
function renderBoard() {
    const cells = document.querySelectorAll('#board .cell');
    cells.forEach(cell => {
        const r = +cell.dataset.row;
        const c = +cell.dataset.col;
        const id = board[r][c];
        
        cell.className = 'cell';
        cell.innerHTML = '';

        if (!id) return;

        const shipData = placedShips[id];
        if (!shipData) return;

        cell.classList.add('cell-ship');
        if (shipData.vertical) {
            cell.classList.add('ship-vertical');
        } else {
            cell.classList.add('ship-horizontal');
        }

        // голова корабля
        if (r === shipData.row && c === shipData.col) {
            cell.classList.add('ship-head');
        }
    });
}

// обновление дока (использованные корабли)
function updateDockState() {
    document.querySelectorAll('.ship-preview').forEach(el => {
        const id = el.dataset.shipId;
        if (placedShips[id]) {
            el.classList.add('used');
            el.draggable = false;
            el.style.opacity = '0.5';
        } else {
            el.classList.remove('used');
            el.draggable = true;
            el.style.opacity = '1';
        }
    });
}

// кнопки
function setupButtons() {
    const btnClear = document.getElementById('btnClear');
    const btnRandom = document.getElementById('btnRandom');
    const btnConfirm = document.getElementById('btnConfirm');

    // очистить поле
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (!myRoomId) return;
            board = Array.from(
                { length: GRID_SIZE },
                () => Array(GRID_SIZE).fill(null)
            );
            placedShips = {};
            renderBoard();
            updateDockState();
        });
    }

    // случайная расстановка (пока заглушка)
    if (btnRandom) {
        btnRandom.addEventListener('click', () => {
            alert('Функция случайной расстановки в разработке');
        });
    }

    // готов
    if (btnConfirm) {
        btnConfirm.addEventListener('click', () => {
            if (!myRoomId) return;

            const totalShips = SHIPS_DEF.reduce((sum, ship) => sum + ship.count, 0);
            const placedCount = Object.keys(placedShips).length;

            if (placedCount < totalShips) {
                alert(`Расставьте все корабли! Осталось: ${totalShips - placedCount}`);
                return;
            }

            const payload = {
                roomId: myRoomId,
                gridSize: GRID_SIZE,
                ships: placedShips
            };
            
            socket.emit('submit_setup', payload, (err, response) => {
                if (err) {
                    alert(err.error || 'Ошибка отправки');
                    return;
                }
                if (response?.success) {
                    alert('Расстановка отправлена');
                    btnConfirm.disabled = true;
                    btnConfirm.textContent = 'Ожидание соперника';
                    socket.emit('ready', { roomId: myRoomId });
                }
            });
        });
    }
}

// старт
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded');
    await fetchConfigAndInit();
    connectWebSocket();
    setupButtons();
});