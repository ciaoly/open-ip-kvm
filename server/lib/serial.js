const { SerialPort } = require('serialport');

let serialport;

function writeSerial(numArr) {
  const buf = Buffer.from(numArr);
  return new Promise((res, rej) => {
    serialport.write(buf, (err, bytesWritten) => {
      if(err) {
        rej(err);
      } else {
        res(bytesWritten);
      }
    });
  });
}

/**
 * 打开串口
 * @param {string} portPath - 串口路径
 * @param {number} baudRate - 波特率
 * @returns 
 */
module.exports.startSerial = function(portPath, baudRate) {
  if (serialport) {
    return;
  }

  serialport = new SerialPort({
    path: portPath,
    baudRate,
  });

  console.log(`serialport ready: ${portPath}`);

  return writeSerial;
}