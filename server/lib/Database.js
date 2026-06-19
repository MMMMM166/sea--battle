const Datastore = require('@seald-io/nedb');
const path = require('path');

class Database {
    constructor() {
        this.roomsDB = new Datastore({
        filename: path.join(__dirname, '..', 'data', 'rooms.db'),
        autoload: true
        });
        
        this.sessionsDB = new Datastore({
        filename: path.join(__dirname, '..', 'data', 'sessions.db'),
        autoload: true
        });
        
        this.roomsDB.ensureIndex({ fieldName: 'roomId', unique: true });
        this.sessionsDB.ensureIndex({ fieldName: 'sessionId', unique: true });
        this.sessionsDB.ensureIndex({ fieldName: 'roomId' });
        
        console.log('[Database] NeDB initialized');
    }

    async saveRoom(roomData) {
        return new Promise((resolve, reject) => {
        this.roomsDB.update(
            { roomId: roomData.roomId },
            roomData,
            { upsert: true },
            (err, numReplaced, upsert) => {
            if (err) reject(err);
            else resolve({ numReplaced, upsert });
            }
        );
        });
    }
    
    async getRoom(roomId) {
        return new Promise((resolve, reject) => {
        this.roomsDB.findOne({ roomId }, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
        });
        });
    }
    
    async deleteRoom(roomId) {
        return new Promise((resolve, reject) => {
        this.roomsDB.remove({ roomId }, {}, (err, numRemoved) => {
            if (err) reject(err);
            else resolve(numRemoved);
        });
        });
    }
    
    async getAllRooms() {
        return new Promise((resolve, reject) => {
        this.roomsDB.find({}, (err, docs) => {
            if (err) reject(err);
            else resolve(docs);
        });
        });
    }
    
    async saveSession(sessionData) {
        return new Promise((resolve, reject) => {
        this.sessionsDB.update(
            { sessionId: sessionData.sessionId },
            sessionData,
            { upsert: true },
            (err, numReplaced, upsert) => {
            if (err) reject(err);
            else resolve({ numReplaced, upsert });
            }
        );
        });
    }
    
    async getSession(sessionId) {
        return new Promise((resolve, reject) => {
        this.sessionsDB.findOne({ sessionId }, (err, doc) => {
            if (err) reject(err);
            else resolve(doc);
        });
        });
    }
    
    async getSessionsByRoom(roomId) {
        return new Promise((resolve, reject) => {
        this.sessionsDB.find({ roomId }, (err, docs) => {
            if (err) reject(err);
            else resolve(docs);
        });
        });
    }
    
    async deleteSession(sessionId) {
        return new Promise((resolve, reject) => {
        this.sessionsDB.remove({ sessionId }, {}, (err, numRemoved) => {
            if (err) reject(err);
            else resolve(numRemoved);
        });
        });
    }
    
    async clearSessionsForRoom(roomId) {
        return new Promise((resolve, reject) => {
        this.sessionsDB.remove({ roomId }, { multi: true }, (err, numRemoved) => {
            if (err) reject(err);
            else resolve(numRemoved);
        });
        });
    }
}

module.exports = Database;