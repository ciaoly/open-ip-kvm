const serial = require("../lib/serial");

const KB_EVT_START = 248;
const KEY_SEQUENCE_EVT_START = 250;
const EVT_END = 251;

const KB_EVT_TYPE_KEYDOWN = 1;
const KB_EVT_TYPE_KEYUP = 2;
const KB_EVT_TYPE_RESET = 3;

const MOUSE_EVT_START = 249;

const MOUSE_EVT_TYPE_MOVE = 1;
const MOUSE_EVT_TYPE_LEFT_DOWN = 2;
const MOUSE_EVT_TYPE_LEFT_UP = 3;
const MOUSE_EVT_TYPE_MIDDLE_DOWN  = 4;
const MOUSE_EVT_TYPE_MIDDLE_UP = 5;
const MOUSE_EVT_TYPE_RIGHT_DOWN = 6;
const MOUSE_EVT_TYPE_RIGHT_UP = 7;
const MOUSE_EVT_TYPE_WHEEL = 8;
const MOUSE_EVT_TYPE_RESET = 9;
const MOUSE_EVT_TYPE_CONFIG_MOVE_FACTOR = 10;

const KEY_EVT_TYPE = {
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

// https://www.arduino.cc/reference/en/language/functions/usb/keyboard/keyboardmodifiers/
const keyRemap = {
  Control: 0x80,
  Shift: 0x81,
  Alt: 0x82,
  Meta: 0x83,
  Tab: 0xB3,
  CapsLock: 0xC1,
  Backspace: 0xB2,
  Enter: 0xB0,
  ContextMenu: 0xED,
  Insert: 0xD1,
  Delete: 0xD4,
  Home: 0xD2,
  End: 0xD5,
  PageUp: 0xD3,
  PageDown: 0xD6,
  ArrowUp: 0xDA,
  ArrowDown: 0xD9,
  ArrowLeft: 0xD8,
  ArrowRight: 0xD7,
  PrintScreen: 0xCE,
  ScrollLock: 0xCF,
  Pause: 0xD0,
  Escape: 0xB1
};

let _writeSerial = null;

for (let i = 0; i < 12; i += 1) {
  keyRemap[`F${1 + i}`] = 0xC2 + i;
}

function isChar(key) {
  if (!key || key.length > 1) {
    return false;
  }
  const keyAscii = key.codePointAt(0);
  return keyAscii >= 32 && keyAscii <= 126;
}

/**
 * 按键事件
 * @param {string} keys - 事件发生时的按键
 * @param {string} keyCode - 按键码
 * @param {string} type - 事件类型
 * @returns 
 */
async function onKeyEvent(key, keyCode, type) {
  // Keyboard event has fixed length of 4 bytes

  // Byte 0: Start Flag - KB_EVT_START
  // Byte 1: Data - Event Param - KB_EVT_TYPE_KEYDOWN | KB_EVT_TYPE_KEYUP | KB_EVT_TYPE_RESET
  // Byte 2: Data - Event Payload - [KeyCode to Press]
  // Byte 3: End Flag - EVT_END
  
  let payload = new Array(4);
  payload.fill(0);

  payload[0] = KB_EVT_START;

  if (type === 'keydown') {
    payload[1] = KB_EVT_TYPE_KEYDOWN;
  } else if (type === 'keyup') {
    payload[1] = KB_EVT_TYPE_KEYUP;
  } else if (type === 'reset') {
    payload[1] = KB_EVT_TYPE_RESET;
  } else {
    return;
  }

  if (type === 'reset') {
    payload[2] = 0;
  } else if (isChar(key)) {
    payload[2] = key.codePointAt(0);
  } else if (keyRemap[key]) {
    payload[2] = keyRemap[key];
  } else {
    return;
  }

  payload[3] = EVT_END;

  // console.log(type, key, payload[2]);
  _writeSerial(payload);
}

function sendSeqBuf(buf) {
  buf.unshift(KEY_SEQUENCE_EVT_START);
  buf.push(EVT_END);
  _writeSerial(buf);
}

function sleep(ms = 100) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function inputSequence(str) {
  if (str.length > 8192) {
    throw 'sequence is too long';
  }

  let buf = [];

  for (let i = 0; i < str.length; i += 1) {
    if (isChar(str[i]) || str[i] === '\n') {
      buf.push(str.codePointAt(i));
    }

    if (buf.length >= 30) {
      sendSeqBuf(buf);
      buf = [];
      await sleep(200);
    }
  }

  if (buf.length) {
    sendSeqBuf(buf);
  }

}

function sMove(n) {
  if (n < -120) {
    return 0;
  }
  if (n > 120) {
    return 240;
  }
  return n + 120;
}

async function onMouseEvent(data, type) {

  let payload = new Array(5);
  payload.fill(0);

  payload[0] = MOUSE_EVT_START;

  if (type === 'move') {
    payload[1] = MOUSE_EVT_TYPE_MOVE;
    payload[2] = sMove(Math.round(data[0] / 1.5));
    payload[3] = sMove(Math.round(data[1] / 1.5));
  } else if (type === 'config-move-factor') {
    payload[1] = MOUSE_EVT_TYPE_CONFIG_MOVE_FACTOR;
    payload[2] = data;
  } else if (type === 'mousedown') {
    switch (data) {
      case 0:
        payload[1] = MOUSE_EVT_TYPE_LEFT_DOWN;
        break;
      case 1:
        payload[1] = MOUSE_EVT_TYPE_MIDDLE_DOWN;
        break;
      case 2:
        payload[1] = MOUSE_EVT_TYPE_RIGHT_DOWN;
        break;
      default:
        return;
    }
  } else if (type === 'mouseup') {
    switch (data) {
      case 0:
        payload[1] = MOUSE_EVT_TYPE_LEFT_UP;
        break;
      case 1:
        payload[1] = MOUSE_EVT_TYPE_MIDDLE_UP;
        break;
      case 2:
        payload[1] = MOUSE_EVT_TYPE_RIGHT_UP;
        break;
      default:
        return;
    }
  } else if(type === 'wheel') {
    payload[1] = MOUSE_EVT_TYPE_WHEEL;
    payload[2] = sMove(Math.round(data / 40));
  } else if(type === 'reset') {
    payload[1] = MOUSE_EVT_TYPE_RESET;
  } else {
    return;
  }

  payload[4] = EVT_END;

  _writeSerial(payload);
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
module.exports = function(serialConfig) {
  const {portPath, baudRate} = serialConfig;
  if (_writeSerial) {
    return;
  }

  _writeSerial = new serial(portPath, baudRate);

  return {
    onKeyEvent, onMouseEvent, inputSequence
  };
}
