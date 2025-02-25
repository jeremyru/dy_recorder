const express = require('express');
const { spawn } = require('child_process');
const bodyParser = require('body-parser');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const moment = require('moment');
const { readUsers, writeUsers } = require('./utils');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

let activeDownloads = [];
let activeProcess = [];
const Now = () => `[${moment().format('YYYY-MM-DD HH:mm:ss')}]`;


// 启动服务器
const PORT = process.env.PORT || 60000;

app.post('/download', (req, res) => {
  const { url, folder, name } = req.body;
  if (!url || !folder || !name) {
    return res.status(400).send({ msg: "缺少必要参数" });
  }

  let wasDownload = activeDownloads.find(item => item.indexOf(name) > -1)
  if (wasDownload) {
    return res.send({ msg: `${name} - 已经在下载` });
  }


  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const outputPath = path.join(folder, `${name}.flv`);

  let finalOutputPath = outputPath;
  let counter = 1;
  while (fs.existsSync(finalOutputPath)) {
    finalOutputPath = path.join(folder, `${name}_${counter}.flv`);
    counter++;
  }

  const ffmpegProcess = spawn(ffmpegPath, [
    '-i', url,
    '-c', 'copy',
    '-loglevel', 'error',
    finalOutputPath
  ], {
    windowsHide: true
  });

  activeDownloads.push(name);

  console.log(`开始下载: ${finalOutputPath}`);

  let lastFileSize = 0;
  let noChangeCount = 0;

  const fileCheckInterval = setInterval(() => {
    fs.stat(finalOutputPath, (err, stats) => {
      if (err) {
        return;
      }

      const currentFileSize = stats.size;
      if (currentFileSize === lastFileSize) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
      }

      lastFileSize = currentFileSize;

      if (noChangeCount >= 3) {
        console.log(`No change in file size for 30 seconds, stopping download: ${finalOutputPath}`);
        ffmpegProcess.kill();
        clearInterval(fileCheckInterval);
      }
    });
  }, 5 * 1000);
  activeProcess.push({ name, ffmpegProcess, timer: fileCheckInterval })


  ffmpegProcess.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  ffmpegProcess.stderr.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });

  ffmpegProcess.on('close', (code) => {
    activeDownloads = activeDownloads.filter(item => item !== name);

    if (code === 0) {
      console.log({ name, msg: "下载完成" });
    } else {
      // console.error({ name, msg: "下载出错或者下载被终止" });
    }
  });
  res.send({ msg: `${name} - 开始下载` });
});

app.get('/', (req, res) => {
  res.send({ msg: "成功连接" })
})

app.get('/getAll', (req, res) => {
  res.json(activeDownloads);
});


app.post('/stop_download', async (req, res) => {
  const { name, type } = req.body;
  if (!name || !type) {
    return res.status(400).send({ msg: "缺少必要参数" });
  }
  let data = [];
  try {
    data = await readUsers()

    data[type].map((item, index) => {
      if (item.name == name) {
        data[type][index].active = false;
      }
    });
    await writeUsers(data)
  } catch {
    console.log("出错了")
  }

  const matchingDownloads = activeDownloads.filter(downloadName => downloadName.includes(name));

  if (matchingDownloads.length > 0) {
    let stop_list = [];
    activeProcess.map((item) => {
      if (item.name.indexOf(name) > -1) {
        item.ffmpegProcess.kill();
        clearInterval(item.timer);
        stop_list.push(name);
      }
    })
    res.send({ stop_list: stop_list.length > 0 ? stop_list : null });
  } else {
    res.send({ msg: "没匹配名称" });
  }
});

app.use('/open_folder', (req, res) => {
  // 通过cmd执行打开文件夹
  const { folder_path } = req.body;
  if (fs.existsSync(folder_path)) {
    const cmd = `cmd /c start ${folder_path}`;
    spawn(cmd, { shell: true });
    res.send({ msg: 'ok' });
  } else {
    res.send({ msg: 'no' });
  }
});

// 读取用户配置文件
app.get('/users', async (req, res) => {
  try {
    let data = await readUsers()
    res.send({ data })
  } catch {
    res.send({ data: [] })
  }
});


setInterval(() => {
  (() => {
    if (activeDownloads.length <= 0) return "";
    const gap = "=".repeat(20)
    console.log(Now())
    console.log(`${gap} 正在下载 ${gap}`)
    activeDownloads.map(item => console.log(item))
    console.log(`${gap}${gap}==========`)
    console.log(" ")
  })();
}, 5000);


app.listen(PORT, () => {
  console.log(`${Now()} 项目运行, 端口${PORT}`);
});