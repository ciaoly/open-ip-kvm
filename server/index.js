const path = require('path');
const url = require('url');

const config = require("./config.json");

config.app_title = config.app_title || 'Open IP-KVM';
config.mjpg_streamer.stream_port = config.mjpg_streamer.stream_port || 8010;

const ws = require('ws');
const Koa = require('koa');
const Router = require('koa-router');
const KoaStaic = require('koa-static');

// const { startSerial } = require('./lib/serial.js');


const driver = require("./driver")(config.driverName);

async function start() {

  try {
    const app = new Koa();
    const router = new Router();
    //   const writeSerial = startSerial(config.serialport.portPath, config.serialport.baudRate);
    hidDevice = driver(config.serialport);
    // await startMJPGStreamer(config.mjpg_streamer);
    if (config.mjpg_streamer) {
      const { startMJPGStreamer } = require('./mjpg-streamer.js');
      await startMJPGStreamer();
    } else if (config.ffmpeg_streamer) {
      // 用于存储客户端连接
      let clients = [];
      const { startFFmpeg, stopFFmpeg } = require("./ffmpeg-streamer");
      router.get('/stream', async (ctx) => {
        if (clients)
          ctx.set('Content-Type', 'video/mp4');

        // 将客户端连接添加到列表中
        clients.push(ctx.res);
        startFFmpeg();

        // 当客户端断开连接时，将其从列表中移除
        ctx.req.on('close', () => {
          clients = clients.filter(client => client !== ctx.res);
          if (clients.length <= 0) {
            stopFFmpeg();
          }
        });

        // 返回一个未结束的响应
        ctx.respond = false;
      });
      // 监听 FFmpeg 推送的流数据
      router.post("/stream", async (ctx, next) => {
        if (ctx.request.ip.indexOf("127.0.0.1") < 0 || ctx.header["x-forwarded-for"] !== undefined) {
          ctx.status = 403;
          return;
        }
        ctx.req.on('data', (chunk) => {
          clients.forEach(client => {
            client.write(chunk);
          });
        });

        ctx.req.on('end', () => {
          ctx.res.end();
        });

        // 返回一个未结束的响应
        ctx.respond = false;
      });
    }

    function websocketHandler(ws) {
      console.log('new websocket connection');
      ws.on('message', function message(data) {
        const msg = JSON.parse(data.toString());
        switch (msg.cmd) {
          case 'keyevent':
            hidDevice.onKeyEvent(msg.payload[0], msg.payload[1], msg.payload[2]);
            break;
          case 'mouseEvent':
            hidDevice.onMouseEvent(msg.payload[0], msg.payload[1]);
            break;
          case 'inputSequence':
            hidDevice.inputSequence(msg.payload)
          default:
            ws.send(JSON.stringify({
              cmd: "UNKNOWN"
            }));
        }
      });

      ws.send(JSON.stringify({
        cmd: 'welcome',
        payload: 'Open IP-KVM Server'
      }));
    }

    app.use(KoaStaic(path.join(__dirname, '../public')));

    const server = app.listen(config.listen_port);
    console.log(`listen on ${config.listen_port}...`);

    router.get("/api/config", async (ctx) => {
      ctx.body = config;
    });

    app.use(router.routes()).use(router.allowedMethods());

    const wsInstance = new ws.WebSocketServer({ noServer: true });
    server.on('upgrade', function upgrade(request, socket, head) {
      const { pathname } = url.parse(request.url);

      if (pathname === '/websocket') {
        wsInstance.handleUpgrade(request, socket, head, function done(ws) {
          wsInstance.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    wsInstance.on('connection', websocketHandler);
  } catch (e) {
    console.log(e);
    process.exit(1);
  }

}

start();

