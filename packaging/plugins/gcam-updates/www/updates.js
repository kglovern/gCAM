const exec = require('cordova/exec');
exports.open = (url, success, failure) => exec(success, failure, 'GcamUpdates', 'open', [url]);
