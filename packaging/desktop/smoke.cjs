const { app } = require('electron');
app.commandLine.appendSwitch('smoke-test');
try {
    require('./main.cjs');
} catch (error) {
    console.error(error);
    app.exit(1);
}
