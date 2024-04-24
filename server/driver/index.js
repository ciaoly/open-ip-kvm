const path = require('path');
const fs = require('fs');

module.exports = function loadDriver(driverName) {
    const driverPath = path.join(__dirname, driverName);
    // if(!fs.accessSync()) {
    //     return new Promise.reject();
    // }
    return require(driverPath);
}