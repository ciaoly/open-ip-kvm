const { spawn } = require('child_process');

let ffmpegProcess;

function startFFmpeg(opt) {
  if (ffmpegProcess) {
    return;
  }

  return new Promise((resolve, reject) => {
    const cmd = [
      'ffmpeg',
      '-f', 'v4l2',
      '-input_format', 'mjpeg',
      '-video_size', opt.res,
      '-i', opt.device,
      '-vf', `fps=${opt.fps}`,
      '-c:v', 'libx264',
      '-b:v', '2M',
      '-f', 'mpegts',
      `http://127.0.0.1:${opt.stream_port}/stream`
    ];

    ffmpegProcess = spawn(cmd.shift(), cmd);

    ffmpegProcess.stdout.on('data', (data) => {
      console.log(data.toString('utf-8'));
    });

    ffmpegProcess.stderr.on('data', (data) => {
      console.error(data.toString('utf-8'));
    });

    ffmpegProcess.on('close', (code) => {
      console.log(`ffmpeg exited with code ${code}`);
      ffmpegProcess = null;
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function stopFFmpeg() {
  if (ffmpegProcess) {
    ffmpegProcess.kill();
    ffmpegProcess = null;
  }
}

module.exports = {
  startFFmpeg,
  stopFFmpeg
};
