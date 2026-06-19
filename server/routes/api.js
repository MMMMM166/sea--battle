'use strict';

module.exports = async function (fastify, opts) {
    // конфиг для клиента (размер поля, корабли)
    fastify.get('/config', async (request, reply) => {
        const defaultConfig = require('../config/default');

        return {
            gridSize: defaultConfig.GRID_SIZE,
            ships: defaultConfig.SHIPS,
            rules: defaultConfig.RULES
        };
    });

    // создание комнаты через рест
    fastify.post('/rooms', async (request, reply) => {
        const { config } = request.body;
        const roomId = fastify.roomManager.createRoom(config || null);
        reply.code(201);
        return { roomId };
    });

    // инфо о комнате
    fastify.get('/rooms/:roomId', async (request, reply) => {
        const { roomId } = request.params;
        const room = fastify.roomManager.getRoom(roomId);

        if (!room) {
            reply.code(404);
            return { error: 'ROOM_NOT_FOUND' };
        }

        return {
            roomId: room.id,
            playerCount: room.players.size,
            phase: room.gameState.phase
        };
    });

    // дебаг - все комнаты
    fastify.get('/debug/rooms', async () => {
        return await fastify.db.getAllRooms();
    });

    // сессии по комнате
    fastify.get('/rooms/:roomId/sessions', async (request, reply) => {
        const { roomId } = request.params;
        try {
            const sessions = await fastify.db.getSessionsByRoom(roomId);
            return { roomId, sessions };
        } catch (err) {
            reply.code(500);
            return { error: 'DATABASE_ERROR' };
        }
    });
};