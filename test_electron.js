const electron = require('electron');
console.log('Electron require result:', electron);
console.log('process.versions:', process.versions);
console.log('ipcMain available:', !!electron.ipcMain);
console.log('ELECTRON_RUN_AS_NODE:', process.env.ELECTRON_RUN_AS_NODE);
