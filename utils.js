/*
 * @Author: Jeremy Ru
 *
 * @Date: 2024-12-17 19:30:27
 * @Description:
 * @LastEditors: Jeremy Ru - 1208470761@qq.com
 * @LastEditTime: 2024-12-28 11:32:00
 */
const fs = require('fs').promises;

// const usersFilePath = path.join(__dirname, "../", 'users.json');
const usersFilePath = "./用户.json";

/**
 * 读取 users.json 文件
 * @returns {Promise<Object>} 返回 JSON 对象
 */
async function readUsers() {
  try {
    const data = await fs.readFile(usersFilePath, 'utf8');
    // 处理允许的注释
    const json = data
      .replace(/\/\/.*$/gm, '') // 删除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, ''); // 删除多行注释
    return Promise.resolve(JSON.parse(json));
  } catch (err) {
    console.error(err.message)
    return Promise.resolve([]);
  }
}

/**
 * 写入数据到 users.json 文件
 * @param {Object} data 要写入的数据
 * @returns {Promise<void>}
 */
async function writeUsers(data) {
  try {
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(usersFilePath, json, 'utf8');
  } catch {
    console.log(12)
  }
}

module.exports = { readUsers, writeUsers };
