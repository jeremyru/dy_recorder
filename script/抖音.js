// ==UserScript==
// @name        抖音录制
// @namespace     http://tampermonkey.net/
// @version      0.1
// @description   在页面上添加一组可拖动的悬浮按钮
// @author       你的名字
// @match        https://www.douyin.com/user/self
// @match        https://www.douyin.com/user/self?*
// @grant        none
// ==/UserScript==

//*://*/*



(function () {
    // Configuration
    const CONFIG = {
        PT: "douyin",
        SERVER_URL: "http://localhost:60000",
        base_zhiliang: "SD2", // 质量:  FULL_HD1:原画，HD1：超清720p ，SD2：高清540p ，SD1：标清480p
        fallback_zhiliang: "FULL_HD1", // 回退质量，当没有找到zhiliang的时候会回退，FULL_HD1和SD1是必有的
        REFRESH_INTERVAL: 20000,
        DIR_PATH: "",
        h_zhiliang: {
            "FULL_HD1": "origin",
            "HD1": "hd",
            "SD2": "sd",
            "SD1": "ld"
        },
        download_type: "flv"
    };

    // State management
    const state = {
        refresh: true,
        users: [],
        newMapArr: [], // 存储需要下载的直播信息
        timeEl: null, // 时间显示元素
        messageEl: null, // 消息显示元素
        usersEl: null, // 用户列表显示元素
        countdownEl: null, // 倒计时显示元素
        openFolderBtn: null,
        container: null
    };

    // Utility functions
    const utils = {
        // 获取当前时间，格式化为 YYYY-MM-DD HH:mm:ss
        formatDate: (date = new Date()) => {
            const pad = num => String(num).padStart(2, '0');
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        },

        // 获取当前时间戳，格式化为 YYYYMMDD_HHmmss
        formatTimestamp: (date = new Date()) => {
            const pad = num => String(num).padStart(2, '0');
            return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
        },

        // 过滤文本，只保留中文和英文字符
        filterText: text => {
            const matches = text.match(/[\u4e00-\u9fffA-Za-z]/g);
            return matches ? matches.join('') : '';
        },

        // 解析URL，提取文件名
        parseUrl: url => {
            const filename = url.split("?")[0].split("/").pop();
            return filename
                .replace(".flv", "")
                .split("_ma1500")[0]
                .replace("_ShowAvcHdL0", "");
        }
    };

    // API functions
    const api = {
        // 获取活动下载任务
        async getUsers() {
            try {
                const response = await fetch(`${CONFIG.SERVER_URL}/users`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                CONFIG.DIR_PATH = data.data[`${CONFIG.PT}_path`];
                return data.data;
            } catch (error) {
                console.error("获取下载列表失败:", error);
                return {};
            }
        },
        // 获取活动下载任务
        async getActiveDownloads() {
            try {
                const response = await fetch(`${CONFIG.SERVER_URL}/getAll`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                return Array.isArray(data) ? data.join("") : '';
            } catch (error) {
                console.error("获取下载列表失败:", error);
                return "";
            }
        },

        // 下载指定项目
        async download(item) {
            return new Promise(async (resolve) => {
                // 文件名
                const name = `${utils.filterText(item.name)}_${utils.formatTimestamp()}_${utils.parseUrl(item.url)}`;
                const folder = `${CONFIG.DIR_PATH}${utils.filterText(item.name)}`;

                try {
                    const response = await fetch(`${CONFIG.SERVER_URL}/download`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: item.url, name, folder })
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    let data = await response.json()
                    resolve([])
                } catch (error) {
                    console.error(`下载出错 - ${name}:`, error);
                    resolve([])
                }
            })
        },
        // 终止下载指定项
        async stop_download(name) {
            try {
                const response = await fetch(`${CONFIG.SERVER_URL}/stop_download`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });

                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error(`终止下载出错 - ${name}:`, error);
            }
        }
    };


    // 处理直播数据
    async function handleLivingData(data) {
        if (!data?.data?.data) return;
        data = data?.data?.data || [];
        const temp_users_list = await api.getUsers();
        state.users = temp_users_list[CONFIG.PT].filter(item => item.active == true);
        const list = new Map(data.map(item => [item.web_rid, item]));
        const name_list = new Map(data.map(item => [item.room.owner.nickname, item]));
        window.name_list = name_list

        state.newMapArr = state.users.map(a_item => {
            let item = list.get(a_item.id);

            if (!a_item.id) {
                try {
                    item = Array.from(name_list).filter(item => item[0].indexOf(a_item.name) > -1)[0][1]
                    let msg = document.createElement("div");
                    msg.innerHTML = `无web_rid用户-${a_item.name}，web_rid-${item.web_rid}`;
                    msg.style = "font-size:25px;color:red;font-weight:bold;"
                    localStorage.setItem(a_item.name, msg.innerHTML);
                    state.container.insertBefore(msg, state.openFolderBtn)
                } catch { }
            }

            if (item) {
                let zhiliang = a_item.qu || CONFIG.base_zhiliang || CONFIG.fallback_zhiliang;
                let stream_data;
                try {

                    // 捕捉横屏行为的stream_url
                    stream_data = JSON.parse(Object.values(item.room.stream_url.pull_datas)[0].stream_data).data;
                    stream_data = stream_data[CONFIG.h_zhiliang[zhiliang]] ? stream_data[CONFIG.h_zhiliang[zhiliang]].main[CONFIG.download_type] : stream_data.origin.main[CONFIG.download_type]
                    console.log(stream_data[CONFIG.h_zhiliang[zhiliang]], stream_data[CONFIG.h_zhiliang[zhiliang]].main[CONFIG.download_type], stream_data.origin.main[CONFIG.download_type])
                    // if (CONFIG.h_zhiliang_single) {
                    //     stream_data = stream_data[CONFIG.h_zhiliang_single] ? stream_data[CONFIG.h_zhiliang_single].main[CONFIG.download_type] : stream_data.origin.main[CONFIG.download_type];
                    // }

                } catch {
                }
                stream_data = typeof stream_data == "string" ? stream_data : ""
                return {
                    ...a_item,
                    url: stream_data || item.room.stream_url.flv_pull_url[zhiliang] ||
                        item.room.stream_url.flv_pull_url[CONFIG.fallback_zhiliang],
                    nickname: item?.name || utils.filterText(item.room.owner.nickname) || item.web_rid,
                }
            }
        }).filter(item => item);


        await processDownloads();
        // 在这里放置你想要执行的代码
        updateUI();
        setInterval(() => {
            (() => {
                updateUI()
            })();
        }, 1000 * 10)

    }

    // 处理下载任务
    let timer = null;

    async function processDownloads() {
        return new Promise(async (resolve) => {
            const activeDownloads = await api.getActiveDownloads();
            state.newMapArr.map(async (item, index) => {
                const filename = utils.parseUrl(item.url);
                if (activeDownloads.indexOf(filename) == -1) {
                    console.log(`${item.name} - 开始下载`)
                    await api.download(item);
                } else {
                    console.log(`${item.name} - 已经在下载了`)
                }
            })
            resolve(activeDownloads)
        })
    }

    async function stop(item) {
        let isClose = confirm(`确定终止 ${item.name} 的录制吗？`)
        if (!isClose) return console.log("取消了终止命令");
        console.log("收到终止指令", item.id, item.name)

        try {
            const response = await fetch(`${CONFIG.SERVER_URL}/stop_download`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: item.name, type: CONFIG.PT })
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            let data = await response.json();
            console.log("修改后的数据", data)
            location.reload();
            return
        } catch (error) {
            console.error(`终止下载出错 - ${name}:`, error);
        }

    }



    // 更新UI显示
    async function updateUI() {
        if (!state.timeEl) return;
        state.timeEl.innerHTML = `更新时间: ${utils.formatDate()}`;
        state.messageEl.innerHTML = `当前监控: ${state.newMapArr.length}个直播 <br/> ${"=".repeat(20)}`;
        // state.usersEl.innerHTML = state.newMapArr.map((item,index) => `${index + 1} -- ${item.name}`).join('<br/> ');

        try {
            await processDownloads();
            const activeDownloads = await api.getActiveDownloads();
            state.newMapArr.map(async (item, index) => {
                let user_item_el = document.querySelector(`.${utils.filterText(item.name)}`);
                let span = document.querySelector(`.${utils.filterText(item.name)} span`)
                if (!user_item_el) {
                    user_item_el = document.createElement("p");
                    user_item_el.style = "display:flex;margin-bottom:10px;"
                    span = document.createElement("span");

                    let stop_button = document.createElement("button");
                    stop_button.textContent = "终止";
                    stop_button.addEventListener("click", () => stop(item))
                    stop_button.style = "margin-left:20px;"

                    let open_user_folder = document.createElement("button");
                    open_user_folder.textContent = "打开";
                    open_user_folder.addEventListener("click", () => openFolder(`${utils.filterText(item.name)}`))
                    state.openFolderBtn.addEventListener("click", () => openFolder())
                    open_user_folder.style = "margin-left:20px;background:#4CAF50;"

                    user_item_el.setAttribute("class", utils.filterText(item.name))
                    user_item_el.append(span, open_user_folder, stop_button)
                    state.usersEl.append(user_item_el)
                }
                const filename = utils.parseUrl(item.url);
                if (activeDownloads.indexOf(filename) > -1) {
                    // return `${index + 1} -- ${item.name} true <button onclick="stop">测试</button><br/>`
                    span.innerText = `${index + 1} -- ${item.name}[${item.qu || 'SD2'}] true`;
                    return

                }
                span.innerText = `${index + 1} -- ${item.name} false`;
                return;
                // return `${index + 1} -- ${item.name} false <br/>`
            })

            const temp_users_list = await api.getUsers();
            const unactive = temp_users_list[CONFIG.PT].filter(item => {
                if (item.active == false && activeDownloads.indexOf(item.name) > -1) {
                    console.log("结束", item.name)
                }
            });
            state.users = temp_users_list[CONFIG.PT].filter(item => item.active == true)
        } catch {
        }

    }
    function openFolder(name) {
        fetch(`${CONFIG.SERVER_URL}/open_folder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folder_path: name ? `${CONFIG.DIR_PATH}${name}` : CONFIG.DIR_PATH })
        });
    };
    // UI functions
    function createUI() {
        state.container = document.createElement('div');
        state.container.style.cssText = 'position:fixed;top:0px;right:0px;z-index:9999;background:#000000;padding:10px;border-radius:5px;color:white;font-size:14px;max-height:100vh;overflow:auto;width:fit-content;';

        state.timeEl = document.createElement('div');
        state.messageEl = document.createElement('div');
        state.usersEl = document.createElement('div');

        // 添加倒计时显示元素
        state.countdownEl = document.createElement('div');
        state.countdownEl.style.cssText = 'font-size: 12px; color: yellow; margin-top: 5px;';

        // 添加打开文件夹按钮
        state.openFolderBtn = document.createElement('button');
        state.openFolderBtn.textContent = '打开下载文件夹';
        state.openFolderBtn.style.cssText = 'margin-bottom:10px;padding:5px 10px;background:#4CAF50;border:none;color:white;border-radius:3px;cursor:pointer;';


        state.container.append(state.openFolderBtn, state.countdownEl, state.timeEl, state.messageEl, state.usersEl);
        document.body.appendChild(state.container);
    }



    // 倒计时功能
    function startCountdown(min, max) {
        max = max * 1000 * 60;
        min = min * 1000 * 60
        const randomInterval = Math.floor(Math.random() * (max - min + 1)) + min; // 随机2到3分钟
        let remainingTime = randomInterval;

        let count = 0;
        function check() {
            if (!state.messageEl?.innerHTML) {
                location.reload();
            }
        }
        const countdownInterval = setInterval(() => {
            count += 1;
            if (count >= 20) {
                check()
            }
            try {
                remainingTime -= 1000;
                state.countdownEl.innerHTML = `倒计时: ${parseInt(Math.max(remainingTime / 1000, 0))}秒`;

                if (remainingTime <= 0) {
                    clearInterval(countdownInterval);
                    if (state.refresh) {
                        location.reload();
                    }
                }
            } catch { }
        }, 1000);
    }

    // 拦截网络请求
    function interceptNetworkRequests() {
        // 劫持 fetch 方法
        const originalFetch = window.fetch;
        const catch_url = "webcast/web/feed/follow"
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            if (args[0].includes(catch_url)) {
                const clone = response.clone();
                const data = await clone.json();
                handleLivingData(data);
            }
            return response;
        };

        // 劫持 XMLHttpRequest 方法
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, ...args) {
            if (url.includes(catch_url)) {
                this.addEventListener('load', function () {
                    try {
                        const data = JSON.parse(this.responseText);
                        handleLivingData(data);
                    } catch (error) {
                        console.error('解析响应失败:', error);
                    }
                });
            }
            return originalOpen.call(this, method, url, ...args);
        };
    }

    // 初始化应用
    function init() {
        createUI();
        startCountdown(2, 3)
        // 主页面初始化
        interceptNetworkRequests();

    }

    // 启动应用
    try {
        console.log("开始执行")
        init();
    } catch (error) {
        console.error("应用初始化失败:", error);
    }
})();