/*
JD撸羊毛自动上车
corn 0/15 * * * *

★ 配置区 ★
*/
let name = "JD撸羊毛自动上车"             // 任务名称（仅用于通知显示）
let serverUrl = `http://10.10.10.12:9090/api/webapi/push`  // API推送地址
let platform = "HumanTG"                 // 推送平台
let userId = "8133043304"                // 推送目标ID
let preCommand = "4"                     // 预先发送的命令
let preDelay = 10000                     // 预指令发送后的延迟时间（毫秒）

/*
★ 执行区 ★（请勿修改下面代码）
*/
let notifyBody = "";
let shouldNotify = false; // 新增标志，控制是否发送通知
const got = require('got');
const fs = require('fs');
const path = require('path');

// 本地记录文件路径
const LAST_CK_FILE = path.join(__dirname, 'last_sent_cks.json');

!(async () => {
    // 打印配置信息
    log(`⚙️ 当前配置:`);
    log(`→ 名称: ${name}`);
    log(`→ API地址: ${serverUrl}`);
    log(`→ 平台: ${platform}`);
    log(`→ 目标ID: ${userId}`);
    log(`→ 预指令: "${preCommand}"`);
    log(`→ 延迟: ${preDelay}ms (${preDelay/1000}秒)`);
    
    // 1. 获取环境变量
    const envResp = await QLAPI.getEnvs({
        searchValue: 'JD_COOKIE'
    });
    if (!envResp || !envResp.data || envResp.code !== 200) {
        log("❌ 获取环境变量失败");
        notifyBody = "❌ 获取环境变量失败";
        shouldNotify = true; // 错误情况下需要通知
        return;
    }
    
    // 解析pt_pin函数
    function getPin(cookie) {
        let match = cookie.match(/pt_pin=([^;]+)/);
        let pin = match ? match[1] : "无法解析";
        try {
            return decodeURIComponent(pin);
        } catch (e) {
            return pin;
        }
    }
    
    // 整理有效/无效账号
    const validCookies = [];
    const validData = [];
    const invalidData = [];
    const validPins = new Set(); // 用于查重
    
    for (const env of envResp.data) {
        if (env.name === 'JD_COOKIE') {
            const pin = getPin(env.value);
            const info = `${env.status === 0 ? '✅' : '❌'} ${pin} (${env.remarks})`;
            
            // 检查是否重复
            if (env.status === 0) {
                // 如果是新的有效账号
                if (!validPins.has(pin)) {
                    validCookies.push(env.value);  
                    validData.push(info);
                    validPins.add(pin);
                    log(`→ 发现新CK: ${pin} (备注: ${env.remarks || "无"})`);
                } else {
                    log(`⚠️ 忽略重复CK: ${pin} (备注: ${env.remarks || "无"}) - 仅保留第一次出现的账号`);
                }
            } else {
                invalidData.push(info);
            }
        }
    }
    
    // 格式化账号列表
    function formatAccounts(accounts, limit = 20) {
        if (accounts.length === 0) return "无";
        return accounts.length <= limit ? 
            accounts.join("\n  ") : 
            accounts.slice(0, limit).join("\n  ") + `\n  等${accounts.length}个账号（只展示前${limit}个）`;
    }
    
    const resultNotify = `✅ 有效账号(${validData.length}个):\n  ${formatAccounts(validData)}` +
                         `\n\n❌ 无效账号(${invalidData.length}个):\n  ${formatAccounts(invalidData)}`;
    
    // 读取上次发送的CK数据
    let lastSentCookies = [];
    try {
        if (fs.existsSync(LAST_CK_FILE)) {
            const fileData = fs.readFileSync(LAST_CK_FILE, 'utf8');
            lastSentCookies = JSON.parse(fileData);
            log(`📂 上次记录: ${lastSentCookies.length}个CK`);
        } else {
            log("📂 第一次运行，没有CK记录");
        }
    } catch (e) {
        log(`⚠️ 读取CK记录文件失败: ${e.message}`);
    }
    
    // === 核心执行流程 ===
    // 初始化结果变量
    let preCmdResult = "🔄 未检测到CK变动，跳过预指令";
    let waitInfo = "🔄 未检测到CK变动，无需等待";
    let ckSendResult = "🔄 未检测到CK变动";
    let changedCksInfo = "";
    
    // 计算Hash以比较CK数据
    function getCKHash(ck) {
        const pin = getPin(ck);
        return pin.replace(/\s/g, '') + '_' + ck.length;
    }
    
    // 比较两个CK列表的不同
    const currentHashes = new Set(validCookies.map(getCKHash));
    const lastHashes = new Set(lastSentCookies.map(getCKHash));
    
    // 找出新增或变化的CK
    let changedCookies = [];
    let changedPins = [];
    
    for (const ck of validCookies) {
        const hash = getCKHash(ck);
        if (!lastHashes.has(hash)) {
            changedCookies.push(ck);
            changedPins.push(getPin(ck));
        }
    }
    
    // 统计变更情况
    const changedCount = changedCookies.length;
    const addedCount = changedCount;
    const removedCount = lastSentCookies.length - [...lastHashes].filter(h => currentHashes.has(h)).length;
    changedCksInfo = `[CK变动统计] 新增: ${addedCount}, 减少: ${removedCount}, 不变: ${validCookies.length - addedCount}`;
    log(changedCksInfo);
    
    // 1. 检测到有CK变动时才执行发送流程
    if (changedCount > 0) {
        shouldNotify = true; // 设置标志：有变动需要通知
        
        log(`🚨 检测到 ${changedCount} 个CK变动！`);
        
        // 记录变更信息（仅显示前5个）
        let changedNotify = "";
        for (let i = 0; i < Math.min(5, changedPins.length); i++) {
            log(`├─ CK变动 ${i+1}: ${changedPins[i]}`);
            changedNotify += `  ${i < 4 ? "├" : "└"}─ ${changedPins[i]}\n`;
        }
        if (changedPins.length > 5) {
            changedNotify += `  └─ ...等${changedPins.length}个变动账号\n`;
        }
        
        // 1.1 发送预指令
        try {
            log(`📤 正在发送预指令: "${preCommand}"...`);
            const resp = await got.post(serverUrl, {
                json: {
                    platform: platform,
                    userId: userId,
                    type: "text",
                    msg: preCommand
                },
                timeout: 5000,
                throwHttpErrors: false
            });
            
            preCmdResult = resp.statusCode >= 200 && resp.statusCode < 300 ?
                `✅ 预指令发送成功 (指令: "${preCommand}", 状态码: ${resp.statusCode})` :
                `❌ 预指令发送失败 (指令: "${preCommand}", 状态码: ${resp.statusCode})`;
            
            log(preCmdResult);
        } catch (e) {
            preCmdResult = `❌ 预指令发送异常 (指令: "${preCommand}"): ${e.message || e}`;
            log(preCmdResult);
        }
        
        // 1.2 延迟等待（使用配置的延迟时间）
        const waitTime = `${preDelay/1000}秒`;
        log(`⏳ 等待 ${waitTime}后发送账号数据...`);
        waitInfo = `⏳ 等待 ${waitTime} 后发送新账号数据`;
        await new Promise(resolve => setTimeout(resolve, preDelay)); 
        
        // 1.3 发送变化的CK数据
        try {
            log(`📤 正在发送${changedCount}个变动账号...`);
            
            const ckResp = await got.post(serverUrl, {
                json: {
                    platform: platform,
                    userId: userId,
                    type: "text",
                    msg: JSON.stringify(changedCookies)
                },
                timeout: 5000,
                throwHttpErrors: false
            });
            
            // 记录操作结果
            ckSendResult = ckResp.statusCode >= 200 && ckResp.statusCode < 300 ?
                `✅ CK发送成功 (变动账号: ${changedCount})` :
                `❌ CK发送失败 (状态码: ${ckResp.statusCode})`;
            
            log(ckSendResult);
            
            // 保存当前CK数据到本地文件
            try {
                fs.writeFileSync(LAST_CK_FILE, JSON.stringify(validCookies, null, 2));
                log(`💾 保存本次CK更新到本地记录`);
            } catch (e) {
                log(`⚠️ 保存CK记录失败: ${e.message}`);
            }
        } catch (e) {
            ckSendResult = `❌ CK发送异常: ${e.message || e}`;
            log(ckSendResult);
        }
    } else {
        log("🔄 未检测到CK变动，跳过所有发送步骤");
    }
    
    // 4. 构建最终通知
    notifyBody = `🚗 JD撸羊毛自动上车执行报告\n\n` +
                 `⚙️ 任务配置:\n` +
                 `  名称: ${name}\n` +
                 `  预指令: "${preCommand}"\n` +
                 `  延迟: ${preDelay}ms\n\n` +
                 `📊 执行流程:\n` +
                 `  1. ${preCmdResult}\n` +
                 `  2. ${waitInfo}\n` +
                 `  3. ${ckSendResult}\n` +
                 `  4. ${changedCksInfo}\n\n` +
                 `📋 账号统计:\n${resultNotify}`;
})()
.catch((e) => {
    log(`${"❌".repeat(5)} 全局错误 ${"❌".repeat(5)}`);
    log(`❌ 错误原因: ${e.message || e}`);
    if (e.stack) {
        log(`🔧 堆栈信息: ${e.stack.split('\n').slice(0, 3).join('\n')}...`);
    }
    
    notifyBody = `❌${"！".repeat(10)} 脚本运行错误 ${"！".repeat(10)}❌\n` +
                 `${e.message || e}\n\n` +
                 `🔧 可能原因:\n  1. API服务器无法访问\n  2. 文件权限问题\n  3. 脚本执行环境异常`;
    shouldNotify = true; // 错误情况下需要通知
})
.finally(() => {
    // 消息通知处理
    const maxLen = 3800; // 留出空间用于显示截断提示
    if (notifyBody.length > maxLen) {
        const truncated = notifyBody.substring(0, maxLen);
        notifyBody = `${truncated}\n\n⚠️ 通知内容过长已截断（完整报告请查看日志）...`;
    }
    
    // 输出通知内容到日志
    const notifyLog = notifyBody.replace(/^/gm, "  ");
    log("\n" + "=".repeat(50));
    log("📢 最终通知内容:");
    log(notifyLog);
    log("=".repeat(50));
    
    // 只有有CK变动或发生错误时才发送通知
    if (shouldNotify) {
        showmsg(notifyBody);
    } else {
        log("🔄 无CK变动且无错误，跳过通知发送");
    }
});

// 简化日志函数
function log(msg) {
    console.log(`${msg}`);
}

// 发送通知函数
async function showmsg(msg) {
    if (!msg) return;
    try {
        // 在这里实现实际的通知发送逻辑
        var notify = require('./sendNotify');
        await notify.sendNotify(name, msg);
        log(`📨 通知已发送!`);
    } catch (e) {
        log(`❌ 通知发送失败: ${e.message}`);
    }
}
