import * as ws from './ws.mjs';

new Vue({
  el: '#app',
  data: {
    // serviceHost: '10.0.0.235',
    serviceHost: location.hostname,
    streamSrc: '',
    enableVideo: false,
    enableMjpeg: false,
    $channel: null,
    isKeyCaptureActive: false,
    isPointorLocked: false,
    mouseMoveSlice: [0, 0],
    activeDialog: '',
    pasteContent: '',
    ignoreEscapedDialog: false,
    fullScreen: false
  },
  mounted() {
    this.init();
  },
  methods: {
    async init() {
      try {
        this.ignoreEscapedDialog = ["false", "no", "0"].indexOf(
          localStorage.getItem("ignoreEscapedDialog")
        ) < 0;
        const config = await this.fetchConfig();
        document.title = config.app_title;

        if (config.mjpg_streamer) {
          const streamOk = await this.pingStream(config.mjpg_streamer.stream_port);
          if (!streamOk) {
            throw new Error(
              'Video stream is not ready, please check mjpeg process'
            );
          } else {
            this.enableMjpeg = true;
            this.streamSrc = `http://${this.serviceHost}:${config.mjpg_streamer.stream_port}/?action=stream`;
          }
        } else if (config.ffmpeg_streamer) {
          this.enableVideo = true;
          this.streamSrc = `http://${this.serviceHost}:${config.ffmpeg_streamer.stream_port}/stream`;
        }
        this.$channel = await ws.init(
          `ws://${this.serviceHost}:${config.listen_port}/websocket`
        );
        this.bindKeyHandler();
        this.bindMouseHandler();
      } catch (e) {
        alert(e.toString());
      }
    },
    async pingStream(port) {
      try {
        const pingRes = await fetch(`http://${this.serviceHost}:${port}/?action=snapshot`);
        return pingRes.status === 200;
      } catch (e) {
        return false;
      }
    },
    async fetchConfig() {
      try {
        const res = await fetch('/api/config');
        return res.json();
      } catch (e) {
        return null;
      }
    },
    bindKeyHandler() {
      document.addEventListener('keydown', (evt) => {
        if (!this.isKeyCaptureActive) {
          if (evt.key === 'Enter' && !this.activeDialog) {
            this.setScreenFocus(true);
          }
          return;
        }

        evt.preventDefault();

        if (evt.repeat) {
          return;
        }

        if (evt.key === 'Escape' && evt.shiftKey) {
          this.setScreenFocus(false);
          return;
        }
        this.$channel.send(JSON.stringify({
          cmd: "keyevent",
          payload: [evt.key, evt.keyCode, 'keydown']
        }));
      });

      document.addEventListener('keyup', (evt) => {
        if (!this.isKeyCaptureActive) {
          return;
        }
        this.$channel.send(JSON.stringify({
          cmd: "keyevent",
          payload: [evt.key, evt.keyCode, 'keyup']
        }));
      });
    },
    bindMouseHandler() {
      const mouseMoveSlice = this.mouseMoveSlice;
      const supportsKeyboardLock =
        ('keyboard' in navigator) && ('lock' in navigator.keyboard);

      document.addEventListener('pointerlockchange', (evt) => {
        this.isPointorLocked =
          document.pointerLockElement &&
          document.pointerLockElement.classList.contains('screen');
        if (!this.isPointorLocked && supportsKeyboardLock) {
          this.setDialog("escaped");
        }
        this.$channel.send(JSON.stringify({
          cmd: "mouseEvent",
          payload: ['', 'reset']
        }));
      });

      document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
          this.fullScreen = false;
          if (supportsKeyboardLock) {
            navigator.keyboard.unlock();
            console.log('Keyboard unlocked.');
          }
        } else {
          this.fullScreen = true;
        }
      });

      window.setInterval(() => {
        if (mouseMoveSlice[0] !== 0 || mouseMoveSlice[1] !== 0) {
          this.$channel.send(JSON.stringify({
            cmd: "mouseEvent",
            payload: [mouseMoveSlice, 'move']
          }));
          mouseMoveSlice[0] = 0;
          mouseMoveSlice[1] = 0;
        }
      }, 30);
      this.$channel.send(JSON.stringify({
        cmd: "mouseEvent",
        payload: [1, 'config-move-factor']
      }));
    },
    onScreenBlur() {
      this.isKeyCaptureActive = false;
      if (this.isPointorLocked) {
        this.setPointerLock(false);
      }
      this.$channel.send(JSON.stringify({
        cmd: "keyevent",
        payload: ['', 0, 'reset']
      }));
    },
    onScreenFocus() {
      this.setDialog();
      this.isKeyCaptureActive = true;
      this.$channel.send(JSON.stringify({
        cmd: "keyevent",
        payload: ['', 0, 'reset']
      }));
    },
    setScreenFocus(bool) {
      const screen = document.querySelector('.screen');
      screen[bool ? 'focus' : 'blur']();
    },
    setPointerLock(bool) {
      const screen = document.querySelector('.screen');
      if (bool) {
        try {
          this.setDialog();
          screen.requestPointerLock();
        } catch (e) { }
      } else {
        document.exitPointerLock();
      }
    },
    onScreenMouseMove(evt) {
      if (!this.isPointorLocked) {
        return;
      }
      this.mouseMoveSlice[0] += evt.movementX;
      this.mouseMoveSlice[1] += evt.movementY;
    },
    onScreenMouseDown(evt) {
      if (!this.isPointorLocked) {
        if (evt.button === 0) {
          this.setPointerLock(true);
        }
        return;
      }
      evt.preventDefault();
      this.$channel.send(JSON.stringify({
        cmd: "mouseEvent",
        payload: [evt.button, 'mousedown']
      }));
    },
    onScreenMouseUp(evt) {
      if (!this.isPointorLocked) {
        return;
      }
      this.$channel.send(JSON.stringify({
        cmd: "mouseEvent",
        payload: [evt.button, 'mouseup']
      }));
    },
    onScreenMouseWheel(evt) {
      if (!this.isPointorLocked) {
        return;
      }
      this.$channel.send(JSON.stringify({
        cmd: "mouseEvent",
        payload: [evt.wheelDeltaY, 'wheel']
      }));
    },
    async lockEscapeKey() {
      if (document.fullscreenElement) {
        // 当前已处于全屏模式
        document.exitFullscreen();
        return;
      }
      // Feature detection.
      const supportsKeyboardLock =
        ('keyboard' in navigator) && ('lock' in navigator.keyboard);

      if (supportsKeyboardLock) {
        // 规避escape键, 但是这个特性只支持chromium
        // 似乎只有进入全屏模式才可以锁定Escape键, 
        // 单纯的进入PointerLocked模式是不可以锁定Escape键的
        // The magic happens here… 🦄
        await navigator.keyboard.lock(['Escape']);
        console.log('Keyboard locked.');
        try {
          await document.documentElement.requestFullscreen();
        } catch (err) {
          navigator.keyboard.unlock();
          console.error(`${err.name}: ${err.message}`);
          console.log('Keyboard unlocked.');
          // this.fullScreen = false;
        }
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    doRemotePaste() {
      this.$channel.send(JSON.stringify({
        cmd: "inputSequence",
        payload: this.pasteContent
      }));
      this.pasteContent = '';
    },
    setDialog(name) {
      if (name) {
        this.setPointerLock(false);
        this.setScreenFocus(false);
        this.activeDialog = name;
      } else {
        this.activeDialog = '';
      }
    },
  },
  watch: {
    ignoreEscapedDialog: function() {
      localStorage.setItem("ignoreEscapedDialog", this.ignoreEscapedDialog);
    }
  }
});
