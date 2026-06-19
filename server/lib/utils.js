
const crypto = require('crypto');


function generateRoomId() {
    return crypto.randomUUID();
}


function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}


function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}


function isValidCoordinate(value, gridSize) {
    return Number.isInteger(value) && value >= 0 && value < gridSize;
}


function formatDate(date) {
    return new Date(date).toISOString();
}


function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function getNested(obj, path, defaultValue = undefined) {
    return path.split('.').reduce((acc, part) => {
        return acc && acc[part] !== undefined ? acc[part] : defaultValue;
    }, obj);
}


function cleanObject(obj) {
    return Object.fromEntries(
        Object.entries(obj).filter(([_, v]) => v != null)
    );
}


function hashString(str) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = {
    generateRoomId,
    randomInt,
    deepClone,
    isValidCoordinate,
    formatDate,
    isEmpty,
    sleep,
    getNested,
    cleanObject,
    hashString
};