// 脚本来源于网络，所涉及到的 账号安全、数据泄露、设备故障、软件违规封禁、财产损失等问题及法律风险！均由使用者自行承担。

/**

 * 0 依赖自动处理：
 *    若环境中未安装 got，脚本会自动 npm i got --no-save
 *    如果还是无法安装，请手动在依赖管理安装 got
 * 1 账号变量命名：
 *    主账号： qlksck="备注1#cookie1#salt1"
 *    多账号： qlksck1="备注2#cookie2#salt2"
 *             qlksck2="备注3#cookie3#salt3"
 *    最多支持 qlksck1 ~ qlksck99
 *    兼容旧格式： ksck="cookie#salt"（无备注）
 * 2 代理（可选）：
 *    在对应变量后追加代理地址，例如
 *     qlksck1="备注#cookie#salt#socks5://127.0.0.1:1080"
 * 3 推送配置（可选）：
 *    将根目录的 sendNotify.js 放在与本脚本同一目录即可自动加载；
 *    支持：Server酱、PushPlus、Bark、TG、钉钉、企微、飞书等 15+ 通道。
 *    各通道密钥请按 sendNotify.js 内注释配置环境变量。
 * 4 定时建议：
 *    青龙面板：0 8,13,19 * * *  （每天 8/13/19 点各跑 1 次）
 * =========================================
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

(function checkGot() {
  try {
    require.resolve('got');
  } catch {
    console.log('⏳ 检测到缺失 got 依赖，正在自动安装...');
    try {
      execSync('npm i got --no-save', { stdio: 'inherit', cwd: __dirname });
      console.log('✅ got 安装完成，继续运行脚本\n');
    } catch (e) {
      console.error('❌ 自动安装 got 失败，请手动进入脚本目录执行：npm i got');
      process.exit(1);
    }
  }
})();

let sendNotify;
try {
  const sendNotifyPath = path.join(__dirname, 'sendNotify.js');
  if (fs.existsSync(sendNotifyPath)) {
    sendNotify = require(sendNotifyPath).sendNotify;
    console.log('✅ 成功加载 sendNotify.js 推送模块');
  } else {
    console.log('⚠️  sendNotify.js 不存在，跳过推送功能');
    sendNotify = null;
  }
} catch (err) {
  console.log(`❌ 无法加载 sendNotify.js: ${err.message}`);
  sendNotify = null;
}

const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');

const CONFIG = {
  USER_AGENT: 'kwai-android aegon/3.56.0',
  API_URL: 'https://nebula.kuaishou.com/rest/n/nebula/activity/earn/overview/basicInfo?source=bottom_guide_first',
  TIMEOUT: 10000,
  MAX_CONCURRENCY: 5,
};

const COLORS = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  bgCyan: '\x1b[46m',
};

const EMOJI = {
  success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️',
  coin: '💰', cash: '💵', loading: '⏳', done: '✨',
  rocket: '🚀', chart: '📊', trophy: '🏆',
};

const logger = {
  info: (msg) => console.log(`${COLORS.cyan}${EMOJI.info} ${msg}${COLORS.reset}`),
  success: (msg) => console.log(`${COLORS.green}${EMOJI.success} ${msg}${COLORS.reset}`),
  error: (msg) => console.log(`${COLORS.red}${EMOJI.error} ${msg}${COLORS.reset}`),
  warn: (msg) => console.log(`${COLORS.yellow}${EMOJI.warning} ${msg}${COLORS.reset}`),
  progress: (msg) => console.log(`${COLORS.blue}${EMOJI.loading} ${msg}${COLORS.reset}`),
  title: (msg) => console.log(`\n${COLORS.bright}${COLORS.bgCyan}  ${EMOJI.trophy} ${msg}  ${COLORS.reset}\n`),
  stat: (msg) => console.log(`${COLORS.green}${EMOJI.chart} ${msg}${COLORS.reset}`),
};

function parseAccountConfig(accountStr, index) {
  if (!accountStr || typeof accountStr !== 'string') {
    return null;
  }
  
  const parts = accountStr.split('#');
  
  if (parts.length === 3) {
    const [remark, cookie, salt] = parts;
    return {
      cookie: cookie.trim(),
      salt: salt.trim(),
      proxyUrl: null,
      remark: remark.trim() || `账号${index}`,
      index,
      raw: accountStr
    };
  } else if (parts.length === 4) {
    const [remark, cookie, salt, proxyOrRemark] = parts;
    
    let proxyUrl = null;
    let finalRemark = remark.trim() || `账号${index}`;
    
    if (proxyOrRemark.startsWith('socks5://') || 
        proxyOrRemark.startsWith('http://') || 
        proxyOrRemark.startsWith('https://')) {
      proxyUrl = proxyOrRemark.trim();
    } else {
      finalRemark = remark.trim() + ' ' + proxyOrRemark.trim();
    }
    
    return {
      cookie: cookie.trim(),
      salt: salt.trim(),
      proxyUrl,
      remark: finalRemark || `账号${index}`,
      index,
      raw: accountStr
    };
  } else if (parts.length === 2) {
    const [cookie, salt] = parts;
    logger.warn(`账号${index}使用旧格式(cookie#salt)，建议更新为备注#cookie#salt格式`);
    return {
      cookie: cookie.trim(),
      salt: salt.trim(),
      proxyUrl: null,
      remark: `账号${index}`,
      index,
      raw: accountStr
    };
  } else {
    logger.error(`账号${index}配置格式错误: ${accountStr.substring(0, 50)}...`);
    logger.info(`支持的格式: 备注#cookie#salt 或 备注#cookie#salt#代理`);
    return null;
  }
}

function loadAccountsFromEnv() {
  const accounts = [];
  const seenAccounts = new Set();
  
  if (process.env.qlksck) {
    const mainAccounts = process.env.qlksck.split('&');
    mainAccounts.forEach((accStr, idx) => {
      const trimmed = accStr.trim();
      if (trimmed && !seenAccounts.has(trimmed)) {
        const account = parseAccountConfig(trimmed, accounts.length + 1);
        if (account) {
          accounts.push(account);
          seenAccounts.add(trimmed);
        }
      }
    });
  }

  for (let i = 1; i <= 99; i++) {
    const envVar = `qlksck${i}`;
    if (process.env[envVar]) {
      const accountStr = process.env[envVar].trim();
      if (accountStr && !seenAccounts.has(accountStr)) {
        const account = parseAccountConfig(accountStr, accounts.length + 1);
        if (account) {
          accounts.push(account);
          seenAccounts.add(accountStr);
        }
      }
    }
  }

  if (process.env.ksck && accounts.length === 0) {
    logger.info('使用旧版环境变量 ksck');
    const oldAccounts = process.env.ksck.split('&');
    oldAccounts.forEach((accStr, idx) => {
      const trimmed = accStr.trim();
      if (trimmed && !seenAccounts.has(trimmed)) {
        const parts = trimmed.split('#');
        if (parts.length === 2) {
          const [cookie, salt] = parts;
          accounts.push({
            cookie: cookie.trim(),
            salt: salt.trim(),
            proxyUrl: null,
            remark: `旧账号${accounts.length + 1}`,
            index: accounts.length + 1,
            raw: trimmed
          });
        } else if (parts.length === 3) {
          const [cookie, salt, third] = parts;
          let proxyUrl = null;
          let remark = `旧账号${accounts.length + 1}`;
          
          if (third.startsWith('socks5://')) {
            proxyUrl = third.trim();
          } else {
            remark = third.trim();
          }
          
          accounts.push({
            cookie: cookie.trim(),
            salt: salt.trim(),
            proxyUrl,
            remark,
            index: accounts.length + 1,
            raw: trimmed
          });
        }
        seenAccounts.add(trimmed);
      }
    });
  }
  
  return accounts;
}

async function getKuaishouCoin(account) {
  const { cookie, proxyUrl, remark, index } = account;
  
  try {
    let axiosConfig = {
      method: 'GET',
      url: CONFIG.API_URL,
      headers: {
        'Host': 'nebula.kuaishou.com',
        'User-Agent': CONFIG.USER_AGENT,
        'Cookie': cookie,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: CONFIG.TIMEOUT
    };
    
    if (proxyUrl) {
      try {
        const agent = new SocksProxyAgent(proxyUrl);
        axiosConfig.httpAgent = agent;
        axiosConfig.httpsAgent = agent;
      } catch (proxyError) {
        logger.warn(`${remark} 代理配置错误: ${proxyError.message}`);
      }
    }
    
    logger.progress(`正在查询 ${COLORS.yellow}${remark}${COLORS.reset}...`);
    const response = await axios(axiosConfig);
    
    if (response.data?.result === 1 && response.data.data) {
      const nickname = response.data.data.userData?.nickname || remark;
      const totalCoin = Number(response.data.data.totalCoin) || 0;
      const allCash = Number(response.data.data.allCash) || 0;

      let coinEmoji = EMOJI.coin;
      if (totalCoin >= 100000) coinEmoji = EMOJI.crown + EMOJI.fire;
      else if (totalCoin >= 50000) coinEmoji = EMOJI.crown;
      else if (totalCoin >= 10000) coinEmoji = EMOJI.trophy;
      else if (totalCoin >= 5000) coinEmoji = EMOJI.star;
      else if (totalCoin >= 1000) coinEmoji = EMOJI.gift;

      let cashEmoji = EMOJI.cash;
      if (allCash >= 100) cashEmoji = EMOJI.bank + EMOJI.moneybag;
      else if (allCash >= 50) cashEmoji = EMOJI.bank;
      else if (allCash >= 10) cashEmoji = EMOJI.moneybag;
      
      return {
        nickname,
        totalCoin,
        allCash,
        remark,
        index,
        status: 'success',
        error: null,
        coinEmoji,
        cashEmoji
      };
    } else {
      return {
        nickname: remark,
        totalCoin: 0,
        allCash: 0,
        remark: remark,
        index: index,
        status: 'error',
        error: response.data?.errorMsg || 'API返回错误',
        coinEmoji: EMOJI.cross,
        cashEmoji: EMOJI.cross
      };
    }
  } catch (error) {
    return {
      nickname: remark,
      totalCoin: 0,
      allCash: 0,
      remark: remark,
      index: index,
      status: 'error',
      error: error.message || '请求异常',
      coinEmoji: EMOJI.cross,
      cashEmoji: EMOJI.cross
    };
  }
}

async function getMultipleAccountsCoins(accounts) {
  const results = [];

  const concurrency = Math.min(CONFIG.MAX_CONCURRENCY, accounts.length);
  const chunkSize = Math.ceil(accounts.length / concurrency);
  
  for (let i = 0; i < accounts.length; i += chunkSize) {
    const chunk = accounts.slice(i, i + chunkSize);
    const promises = chunk.map(account => getKuaishouCoin(account));
    const chunkResults = await Promise.allSettled(promises);
    
    chunkResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        const account = chunk[idx];
        results.push({
          nickname: account.remark,
          totalCoin: 0,
          allCash: 0,
          remark: account.remark,
          index: account.index,
          status: 'error',
          error: result.reason?.message || '未知错误',
          coinEmoji: EMOJI.cross,
          cashEmoji: EMOJI.cross
        });
      }
    });
  }
  
  return results;
}

function printTable(results) {
  logger.title('快手账号金币查询结果');

  let successCnt = 0, totalCoin = 0, totalCash = 0;

  results.forEach(r => {
    if (r.status === 'success') {
      successCnt++;
      totalCoin += r.totalCoin;
      totalCash += r.allCash;
      console.log(`${r.remark} - ${r.nickname}: ${r.totalCoin}金币, ${r.allCash.toFixed(2)}元`);
    } else {
      console.log(`${r.remark} - ${r.nickname}: 0金币, 0.00元（失败：${r.error}）`);
    }
  });

  console.log('');
  logger.stat(`成功 ${successCnt}/${results.length}  |  总金币 ${totalCoin}  |  总现金 ${totalCash.toFixed(2)}`);
  return { successCnt, totalCoin, totalCash, totalAccounts: results.length };
}

function generateNotifyContent(results) {
  let lines = ['【账号详情】'];
  results.forEach(r => {
    if (r.status === 'success') {
      lines.push(`${r.remark} - ${r.nickname}: ${r.totalCoin}金币, ${r.allCash.toFixed(2)}元`);
    } else {
      lines.push(`${r.remark} - ${r.nickname}: 0金币, 0.00元（失败：${r.error}）`);
    }
  });
  return lines.join('\n');
}
function showBanner() {
  console.log('');
  console.log('');
}

async function main() {
  showBanner();
  logger.progress('开始加载快手账号配置...');
  const accounts = loadAccountsFromEnv();
  if (accounts.length === 0) {
    logger.error('未找到有效的账号配置');
    if (sendNotify) await sendNotify('快手金币查询失败', '未找到有效的账号配置，请检查环境变量设置');
    process.exit(1);
  }
  logger.success(`成功加载 ${accounts.length} 个账号 ${EMOJI.trophy}`);
  logger.progress(`正在获取账号金币信息... ${EMOJI.loading}`);
  const results = await getMultipleAccountsCoins(accounts);
  const stats = printTable(results);
  const notifyTitle = `快手金币查询结果 - ${stats.successCnt}/${results.length}成功`;
  const notifyContent = generateNotifyContent(results);
  if (sendNotify) {
    try {
      logger.progress('正在发送推送通知...');
      await sendNotify(notifyTitle, notifyContent);
      logger.success('推送通知发送成功！');
    } catch (e) {
      logger.error(`推送通知失败: ${e.message}`);
    }
  } else logger.warn('未加载 sendNotify.js，跳过推送通知');
  logger.title('脚本执行完成');
  console.log(`${COLORS.green}${EMOJI.done} 所有操作已完成！感谢使用IDeal快手金币查询脚本！${COLORS.reset}`);
}

main().catch(err => {
  logger.error(`脚本执行失败: ${err.message}`);
  if (sendNotify) sendNotify('快手金币查询脚本出错', `错误信息: ${err.message}\n\n请检查脚本配置和网络连接。`);
  process.exit(1);
});

