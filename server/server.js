'use strict';

const Fastify = require('fastify');
const { Server } = require('socket.io');
const path = require('path');
const Database = require('./lib/Database');

let RoomManager;
try {
    RoomManager = require('./lib/RoomManager');
} catch (e) {
    console.error('CRITICAL: Cannot load RoomManager');
    console.error(e);
    process.exit(1);
}

async function start() {
    const fastify = Fastify({
        logger: true,
        routerOptions: {
            maxParamLength: 100
        }
    });

    // статика - фронт
    fastify.register(require('@fastify/static'), {
        root: path.join(__dirname, '..', 'front'),
    });

    // cors - чтобы фронт мог стучаться
    await fastify.register(require('@fastify/cors'), {
        origin: true,
        credentials: true
    });

    const db = new Database();
    fastify.decorate('db', db);

    const roomManager = new RoomManager(db);
    fastify.decorate('roomManager', roomManager);

    // api роуты
    fastify.register(require('./routes/api'), { prefix: '/api' });

    fastify.setNotFoundHandler((request, reply) => {
        reply.code(404).send({
            error: 'Not Found',
            message: 'The requested route does not exist.'
        });
    });

    // сокет сервер
    const io = new Server(fastify.server, {
        cors: {
            origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3002'],
            methods: ['GET', 'POST']
        }
    });

    // хелпер для коллбеков чтобы не крашилось
    function safeCallback(cb, error, data) {
        if (typeof cb === 'function') {
            try {
                cb(error, data);
            } catch (e) {
                console.error('[Socket] Callback error:', e);
            }
        }
    }

    io.on('connection', (socket) => {
        console.log(`[Socket] Connected: ${socket.id}`);

        // игрок заходит в игру
        socket.on('join', (data, cb) => {
            console.log('[Socket] Join request:', data);

            try {
                const { roomId: requestedRoomId, playerName } = data || {};
                let roomId = requestedRoomId;

                // если комнаты нет - создаем новую
                if (!roomId) {
                    roomId = roomManager.createRoom();
                    console.log('[Socket] Auto-created room:', roomId);
                }

                const room = roomManager.getRoom(roomId);

                if (!room) {
                    console.error('[Socket] Room not found:', roomId);
                    return safeCallback(cb, { error: 'ROOM_NOT_FOUND' });
                }

                // добавляем игрока в комнату
                roomManager.addPlayer(roomId, socket.id, { name: playerName || 'Anonymous' });
                socket.join(roomId);

                const player = room.players.get(socket.id);

                // что отдаем клиенту
                const responseData = {
                    type: 'room_joined',
                    roomId: roomId,
                    config: room.config,
                    state: {
                        board: player.board,
                        placedShips: player.placedShips
                    },
                    players: Array.from(room.players.values())
                };

                console.log('[Socket] Join success for room:', roomId);
                safeCallback(cb, null, responseData);
                socket.emit('join:success', responseData);

                // уведомляем остальных в комнате
                socket.to(roomId).emit('player_joined', {
                    playerId: socket.id,
                    playerName: playerName || 'Anonymous'
                });

            } catch (err) {
                console.error('[Socket] CRITICAL ERROR in join:', err);
                safeCallback(cb, { error: 'INTERNAL_ERROR', message: err.message });
            }
        });

        // игрок расставил корабли
        socket.on('submit_setup', (data, cb) => {
            try {
                const { roomId, ships, gridSize } = data;

                const room = roomManager.getRoom(roomId);
                if (!room) {
                    return safeCallback(cb, { error: 'ROOM_NOT_FOUND' });
                }

                const player = room.players.get(socket.id);
                if (!player) {
                    return safeCallback(cb, { error: 'PLAYER_NOT_FOUND' });
                }

                // строим доску из кораблей
                const board = Array.from(
                    { length: gridSize },
                    () => Array(gridSize).fill(null)
                );

                for (const [shipId, ship] of Object.entries(ships)) {
                    const { row, col, size, vertical } = ship;

                    for (let i = 0; i < size; i++) {
                        const r = vertical ? row + i : row;
                        const c = vertical ? col : col + i;
                        board[r][c] = shipId;
                    }
                }

                player.board = board;
                player.placedShips = ships;
                room.lastActivity = Date.now();

                // сохраняем в бд (костыль но работает)
                roomManager._saveRoomToDB(room);

                console.log('[SETUP]', player.name, 'ships:', Object.keys(ships).length);

                safeCallback(cb, null, { success: true });

            } catch (err) {
                console.error(err);
                safeCallback(cb, { error: 'SETUP_FAILED' });
            }
        });

        // игрок готов к бою
        socket.on('ready', (data, cb) => {
            try {
                const { roomId } = data;
                const room = roomManager.getRoom(roomId);

                if (!room) {
                    return safeCallback(cb, { error: 'ROOM_NOT_FOUND' });
                }

                const player = room.players.get(socket.id);
                if (player) {
                    player.ready = true;
                }

                // проверяем все ли готовы
                const allReady = Array.from(room.players.values()).every(p => p.ready);

                if (allReady && room.players.size >= 2) {
                    room.gameState.phase = 'battle';
                    const players = Array.from(room.players.keys());
                    room.gameState.turn = players[0]; // первый ходит

                    // говорим первому что его ход
                    const firstSocket = io.sockets.sockets.get(players[0]);
                    if (firstSocket) {
                        firstSocket.emit('your_turn');
                    }

                    // второму что ход противника
                    const secondSocket = io.sockets.sockets.get(players[1]);
                    if (secondSocket) {
                        secondSocket.emit('enemy_turn');
                    }

                    // всем что бой начался
                    io.to(roomId).emit('game_phase_changed', {
                        phase: 'battle',
                        message: 'Все игроки готовы! Начинаем бой!'
                    });
                }

                safeCallback(cb, null, { success: true, phase: room.gameState.phase });
            } catch (err) {
                console.error('[Socket] Error in ready handler:', err);
                safeCallback(cb, { error: 'READY_FAILED' });
            }
        });

        // выстрел
        socket.on('shoot', (data, cb) => {
            try {
                const { roomId, row, col } = data;

                const room = roomManager.getRoom(roomId);
                if (!room) {
                    return safeCallback(cb, { error: 'ROOM_NOT_FOUND' });
                }

                // проверка чей ход
                if (room.gameState.turn !== socket.id) {
                    return safeCallback(cb, { error: 'NOT_YOUR_TURN' });
                }

                // ищем врага
                const enemy = Array.from(room.players.values()).find(p => p.id !== socket.id);
                if (!enemy) {
                    return safeCallback(cb, { error: 'ENEMY_NOT_FOUND' });
                }

                // попал или нет
                const hit = enemy.board[row][col] !== null;

                // отправляем результат стрелявшему
                socket.emit('shot_result', { row, col, hit });

                // отправляем тому в кого стреляли
                io.to(enemy.id).emit('enemy_shot', { row, col, hit });

                // передаем ход
                room.gameState.turn = enemy.id;
                io.to(enemy.id).emit('your_turn');
                io.to(socket.id).emit('enemy_turn');

                safeCallback(cb, null, { success: true, hit });

            } catch (err) {
                console.error('[shoot]', err);
                safeCallback(cb, { error: 'SHOT_FAILED' });
            }
        });

        // отключение
        socket.on('disconnect', () => {
            console.log(`[Socket] Disconnected: ${socket.id}`);

            for (const [roomId, room] of roomManager.rooms) {
                if (room.players.has(socket.id)) {
                    roomManager.removePlayer(roomId, socket.id);

                    // если комната пустая - удаляем
                    if (room.players.size === 0) {
                        io.to(roomId).emit('room_closed', { type: 'room_closed' });
                        roomManager.destroyRoom(roomId);
                    } else {
                        // говорим остальным что кто-то ушел
                        socket.to(roomId).emit('player_left', { playerId: socket.id });
                    }
                }
            }
        });
    });

    await fastify.listen({ port: 3002, host: '0.0.0.0' });
    console.log('Server listening on port 3002');
}

start().catch(console.error);