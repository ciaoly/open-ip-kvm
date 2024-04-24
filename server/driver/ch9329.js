const { startSerial } = require("../lib/serial");

const CMD_ENUM = {
  CMD_GET_INFO: 1,
  CMD_SEND_KB_GENERAL_DATA: 2,
  CMD_SEND_KB_MEDIA_DATA: 3,
  CMD_SEND_MS_ABS_DATA: 4,
  CMD_SEND_MS_REL_DATA: 5,
  CMD_SEND_MY_HID_DATA: 6,
  CMD_READ_MY_HID_DATA: 0x87,
  CMD_GET_PARA_CFG: 0x08,
  CMD_SET_PARA_CFG: 0x09,
  CMD_GET_USB_STRING: 10,
  CMD_SET_USB_STRING: 11,
  CMD_SET_DEFAULT_CFG: 0x0C,
  CMD_RESET: 0x0F
}

class DataFrame {
  _HEAD = 0x57ab;
  _ADDR = 0x00;
  _CMD = CMD_ENUM.CMD_GET_INFO;
  _DATA = [];

  constructor(cmd) {
    if (cmd) {
      this.CMD = cmd;
    }
  }

  get ADDR() {
    return this._ADDR;
  }
  set ADDR(val) {
    this._ADDR = val % 0x100;
  };

  get CMD() {
    return this._CMD;
  }

  set CMD(val) {
    if (Object.values(CMD_ENUM).includes(val)) {
      this._CMD = val;
    } else {
      this._CMD = CMD_ENUM.CMD_GET_INFO;
    }
  }

  get DATA() {
    return this._DATA;
  }

  set DATA(val) {
    if (Array.isArray(val)) {
      this._DATA = val;
    } else {
      this._DATA = [];
    }
  }

  get LEN() {
    return this._DATA.length;
  }

  set LEN(val) { }

  get SUM() {
    let sum = 0;
    for (let num of this._DATA) {
      sum += num;
    }
    return ((0xff & this._HEAD) + (this._HEAD >> 8 & 0xff) +
      this._ADDR + this._CMD + this.LEN + sum) | 0xff;
  }

  set SUM(val) { }

  toBuffer() {
    const buf = [];
    buf.push(this._HEAD >> 8 & 0xff);
    buf.push(this._HEAD & 0xff);
    buf.push(this._ADDR);
    buf.push(this._CMD);
    buf.push(this.LEN);
    for (let e of this._DATA) {
      buf.push(e);
    }
    buf.push(this.SUM);
    return Buffer.from(buf);
  }
}

let _writeSerial = null;

// /**
//  * 按键事件
//  * @param {(string|string[])} keys - 事件发生时的按键列表
//  * @param {number} [accKeys=0x0] - 事件发生时的辅助键列表, 使用0xff分别表示左右区共7个键
//  * @param {string} type - 事件类型
//  * @returns 
//  */
// async function onKeyEvent(keys = [], accKeys = 0x0, type) {

// 需要保存当前的按键状态
class KeyStatus {
  normalKeys = [];
  accKeys = 0x0;

  normalKeyCodeToHID = {
    // 字母键
    65: 0x04, // A
    66: 0x05, // B
    67: 0x06, // C
    68: 0x07, // D
    69: 0x08, // E
    70: 0x09, // F
    71: 0x0A, // G
    72: 0x0B, // H
    73: 0x0C, // I
    74: 0x0D, // J
    75: 0x0E, // K
    76: 0x0F, // L
    77: 0x10, // M
    78: 0x11, // N
    79: 0x12, // O
    80: 0x13, // P
    81: 0x14, // Q
    82: 0x15, // R
    83: 0x16, // S
    84: 0x17, // T
    85: 0x18, // U
    86: 0x19, // V
    87: 0x1A, // W
    88: 0x1B, // X
    89: 0x1C, // Y
    90: 0x1D, // Z

    // 数字键
    48: 0x27, // 0
    49: 0x1E, // 1
    50: 0x1F, // 2
    51: 0x20, // 3
    52: 0x21, // 4
    53: 0x22, // 5
    54: 0x23, // 6
    55: 0x24, // 7
    56: 0x25, // 8
    57: 0x26, // 9

    // 符号键
    186: 0x33, // ;
    187: 0x2E, // =
    188: 0x36, // ,
    189: 0x2D, // -
    190: 0x37, // .
    191: 0x38, // /
    192: 0x35, // `
    219: 0x2F, // [
    220: 0x31, // \
    221: 0x30, // ]
    222: 0x34, // '

    // 功能键
    8: 0x2A,   // Backspace
    9: 0x2B,   // Tab
    13: 0x28,  // Enter
    20: 0x39,  // Caps Lock
    27: 0x29,  // Escape
    32: 0x2C,  // Space
    33: 0x4B,  // Page Up
    34: 0x4E,  // Page Down
    35: 0x4D,  // End
    36: 0x4A,  // Home
    37: 0x50,  // Left Arrow
    38: 0x52,  // Up Arrow
    39: 0x4F,  // Right Arrow
    40: 0x51,  // Down Arrow
    45: 0x49,  // Insert
    46: 0x4C,  // Delete
    144: 0x53, // Num Lock
    145: 0x47, // Scroll Lock
    0x58: 0x58, //Right Enter

    // F1 - F12
    112: 0x3A, // F1
    113: 0x3B, // F2
    114: 0x3C, // F3
    115: 0x3D, // F4
    116: 0x3E, // F5
    117: 0x3F, // F6
    118: 0x40, // F7
    119: 0x41, // F8
    120: 0x42, // F9
    121: 0x43, // F10
    122: 0x44, // F11
    123: 0x45, // F12
  };
  accKeyCodeToHID = {
    17: 0xE0,  // Control
    16: 0xE1,  // Shift
    18: 0xE2,  // Alt
    91: 0xE3,  // Left Super
    0xE4: 0xE4, //Right Ctrl
    0xE5: 0xE5, //Right Shift
    0xE6: 0xE6, //Right Alt
    0xE7: 0xE7, //Right Super
  };

  onKeyDown(key, keyCode) {
    let _hid = this.normalKeyCodeToHID[keyCode];
    if (_hid) {
      // 普通按键
      // if(this.normalKeys.length < 6) {
      if (this.normalKeys.length >= 6) {
        // 超过6个的话, 就挤走前面的
        this.normalKeys.shift();
      }
      this.normalKeys.push(_hid);
      return;
    }
    _hid = this.accKeyCodeToHID[keyCode];
    if (_hid) {
      // 快捷键的功能键
      this.accKeys |= (0x1 << (_hid - 0xE0));
      return;
    }
  }

  onKeyUp(key, keyCode) {
    let _hid = this.normalKeyCodeToHID[keyCode];
    if (_hid) {
      // 普通按键
      if (this.normalKeys.length > 0) {
        const index = this.normalKeys.indexOf(keyCode);
        if (index >= 0) {
          this.normalKeys.splice(index, 1);
        }
      }
      return;
    }
    _hid = this.accKeyCodeToHID[keyCode];
    if (_hid) {
      // 快捷键的功能键
      this.accKeys &= ~(0x1 << (_hid - 0xE0));
      return;
    }
  }

  onKeyReset() {
    this.accKeys = 0x0;
    this.normalKeys = [];
  }

  getKeyData() {
    let _arr = Array.from(this.normalKeys);
    _arr.unshift(this.accKeys, 0x0);
    for (let i = this.normalKeys.length; i < 6; i++) {
      _arr.push(0x0);
    }
    return _arr;
  }
}

class MouseStatus {
  movementX = 0;
  movementY = 0;
  wheelDeltaY = 0;
  keyPressed = 0x0;

  onMouseUp(keyFlag) {
    switch (keyFlag) {
      case 0:
        this.keyPressed &= ~(0x1);
        break;
      case 1:
        // 鼠标右键
        this.keyPressed &= ~(0x1 << 2);
        break;
      case 2:
        // 鼠标中键
        this.keyPressed &= ~(0x1 << 1);
        break;
      default:
        return;
    }
  }

  onMouseDown(keyFlag) {
    switch (keyFlag) {
      case 0:
        this.keyPressed |= 0x1;
        break;
      case 1:
        // 鼠标右键
        this.keyPressed |= 0x1 << 2;
        break;
      case 2:
        // 鼠标中键
        this.keyPressed |= 0x1 << 1;
        break;
      default:
        return;
    }
  }

  onMouseMove(movementX, movementY) {
    [this.movementX, this.movementY] = [movementX, movementY];
  }

  onWheel(wheelDeltaY) {
    this.wheelDeltaY = wheelDeltaY;
  }

  onReset() {
    this.keyPressed = this.movementX = this.movementY = this.wheelDeltaY = 0;
  }

  getMouseData() {
    return [0x01, this.keyPressed, ...(
      this.convertMovementPixel([this.movementX, this.movementY, this.wheelDeltaY])
    )];
  }

  convertMovementPixel(args = []) {
    if (typeof args == "number") {
      return 0xff & (args + 256);
    }
    if (Array.isArray(args)) {
      let ret = [];
      for (let n of args) {
        if (!isNaN(parseInt(n))) {
          ret.push(0xff & (parseInt(n) + 256));
        }
      }
      return ret;
    }
    return [0];
  }
}

function asciiToKeycode(char) {
  const charCode = char.charCodeAt(0);

  const symbolMappings = {
    ' ': [32, null], // 空格键没有 Shift 键码
    '!': [49, 16],
    '"': [222, 16],
    '#': [51, 16],
    '$': [52, 16],
    '%': [53, 16],
    '&': [55, 16],
    "'": [222, null], // 单引号不需要按下 Shift 键
    '(': [57, 16],
    ')': [48, 16],
    '*': [56, 16],
    '+': [187, 16],
    ',': [188, null],
    '-': [189, null],
    '.': [190, null],
    '/': [191, null],
    ':': [186, 16],
    ';': [186, null],
    '<': [188, 16],
    '=': [187, null],
    '>': [190, 16],
    '?': [191, 16],
    '@': [50, 16],
    '[': [219, null],
    '\\': [220, null],
    ']': [221, null],
    '^': [54, 16],
    '_': [189, 16],
    '`': [192, null],
    '{': [219, 16],
    '|': [220, 16],
    '}': [221, 16],
    '~': [192, 16],
  };

  if (char in symbolMappings) {
    return symbolMappings[char];
  } else {
    // 检查是否为字母
    if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
      // 字母键，返回对应的普通键盘键码和 Shift 键码
      const shiftKeyCode = charCode >= 65 && charCode <= 90 ? 16 : null; // 大写字母需要按下 Shift 键
      return [charCode, shiftKeyCode];
    }
    // 检查是否为数字
    else if (charCode >= 48 && charCode <= 57) {
      // 数字键，返回对应的普通键盘键码和 Shift 键码
      return [charCode, null]; // 数字键没有 Shift 键码
    } else {
      // 如果不是字母、数字或标点符号，则返回空数组
      return [];
    }
  }
}

const keyStatus = new KeyStatus();
const mouseStatus = new MouseStatus();

/**
 * 按键事件
 * @param {string} key - 事件发生时的按键
 * @param {string} keyCode - 按键码
 * @param {string} type - 事件类型
 */
async function onKeyEvent(key, keyCode, type) {

  let payload = new DataFrame(CMD_ENUM.CMD_SEND_KB_GENERAL_DATA);

  if (type === 'keydown') {
    keyStatus.onKeyDown(key, keyCode);
  } else if (type === 'keyup') {
    keyStatus.onKeyUp(key, keyCode);
  } else if (type === 'reset') {
    keyStatus.onKeyReset();
  } else {
    return;
  }

  payload.DATA = keyStatus.getKeyData();

  _writeSerial(payload.toBuffer());
}

async function sendKeys(keyCodes = []) {
  let payload = new DataFrame(CMD_ENUM.CMD_SEND_KB_GENERAL_DATA);
  let _keyStatus = new KeyStatus();
  for (let keyCode of keyCodes) {
    if (!keyCode) {
      continue;
    }
    // 模拟按下,
    _keyStatus.onKeyDown(null, keyCode);
  }
  // 所有按键一起按下, 打包发过去
  payload.DATA = _keyStatus.getKeyData();
  _writeSerial(payload.toBuffer());
  // 模拟松开
  _keyStatus.onKeyReset();
  payload.DATA = _keyStatus.getKeyData();
  _writeSerial(payload.toBuffer());
}

async function sendChar(char) {
  return sendKeys(asciiToKeycode(char));
}

async function inputSequence(str) {
  if (str.length > 8192) {
    throw 'sequence is too long';
  }

  for (let s of str) {
    await sendChar(s);
    await sleep(100);
  }
}

async function onMouseEvent(data, type) {
  let payload = new DataFrame(CMD_ENUM.CMD_SEND_MS_REL_DATA);

  if (type === 'move') {
    mouseStatus.onMouseMove(data[0], data[1]);
  } else if (type === 'mousedown') {
    mouseStatus.onMouseDown(data);
  } else if (type === 'mouseup') {
    mouseStatus.onMouseUp(data);
  } else if (type === 'wheel') {
    mouseStatus.onWheel(data);
  } else if (type === 'reset') {
    mouseStatus.onReset();
  } else {
    return;
  }

  payload.DATA = mouseStatus.getMouseData();

  _writeSerial(payload.toBuffer());
}

function sleep(ms = 100) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

/**
 * @typedef {Object} SerialConfig
 * @property {string} portPath - 串口路径
 * @property {number} baudRate - 波特率
 */
/**
 * 
 * @param {SerialConfig} serialConfig - 串口配置
 * @returns 串口
 */
module.exports = function (serialConfig) {
  const { portPath, baudRate } = serialConfig;
  if (_writeSerial) {
    return;
  }

  _writeSerial = startSerial(portPath, baudRate);

  return {
    onKeyEvent, onMouseEvent, inputSequence, sendKeys
  };
}
