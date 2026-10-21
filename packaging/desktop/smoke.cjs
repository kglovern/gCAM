const { app } = require('electron');
app.commandLine.appendSwitch('smoke-test');
require('./main.cjs');
