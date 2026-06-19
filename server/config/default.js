module.exports = {
  GRID_SIZE: 10,
  SHIPS: [
    { id: 'ship-4', size: 4, count: 1 },
    { id: 'ship-3', size: 3, count: 2 },
    { id: 'ship-2', size: 2, count: 3 },
    { id: 'ship-1', size: 1, count: 4 }
  ],
  RULES: {
    allowTouch: false,
    allowOverlap: false
  }
};