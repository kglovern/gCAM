const exec = require('cordova/exec');
exports.save = (name, text, mime, success, failure) => exec(success, failure, 'GcamFiles', 'save', [name, text, mime]);
