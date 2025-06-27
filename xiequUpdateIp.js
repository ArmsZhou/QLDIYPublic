/*
携趣多账号顺序更新白名单
corn 0/15 * * * *
在IP白名单授权页面复制 uid、ukey
在ip提取页面生成链接复制 vkey
变量名 xiequCk， uid##ukey##vkey,多个账号用@@分割
*/
let name = "携趣多账号顺序更新白名单"
const $ = new Env(name);
const evnCookie = $.isNode() ? (process.env.xiequCk || "") : ($.getdata('xiequCk') || "");
const MIN_COUNT = 10;       // 切换白名单的阈值
const NOTIFY_THRESHOLD = 100; // 发送通知的阈值
const MAX_IP_RETRY = 3;     // IP获取最大重试次数
const VALID_IP_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/; // 验证IP格式的正则
let currentIp = '';
let globalNotifyMsg = '';
class UserManager {
    constructor(cookies) {
        this.cookies = cookies;
        this.accountIndex = 0;
        this.quantity = 0;
        this.whiteList = "";
        this.needNotify = false;
        this.notifyMsg = '';
        this.ipChanged = false;
        this.hasValidAccount = false;
        this.whitelistUpdated = false;
        this.allAccountsNoFlow = true;
        this.accountStatus = [];
        this.currentAccount = null;
        this.ipError = false;
    }
    
    // 普通日志，不触发通知
    log(msg) {
        const uid = this.getCurrentUID();
        $.log(`账号${this.accountIndex}-[${uid}]: ${msg}`);
    }
    
    // 重要日志，会包含在通知中
    logMessage(msg) {
        const uid = this.getCurrentUID();
        const formattedMsg = `账号${this.accountIndex}-[${uid}]: ${msg}`;
        $.log(formattedMsg);
        this.notifyMsg += `${formattedMsg}\n`;
    }
    
    getCurrentUID() {
        return this.cookies[this.accountIndex]?.split("##")[0] || '未知账号';
    }
    
    isValidIP(ip) {
        return ip && VALID_IP_REGEX.test(ip);
    }
    
    async fetchCurrentIP() {
        let retryCount = 0;
        let newIp = '';
        
        while (retryCount < MAX_IP_RETRY && !this.isValidIP(newIp)) {
            retryCount++;
            try {
                newIp = await new Promise((resolve) => {
                    $.get({ url: "https://4.ipw.cn" }, (err, resp, data) => {
                        if (err || !data) {
                            this.log(`IP获取失败，第${retryCount}次重试，错误: ${err || '无数据'}`);
                            resolve('');
                            return;
                        }
                        
                        const ip = data?.trim() || '';
                        if (this.isValidIP(ip)) {
                            resolve(ip);
                        } else {
                            this.log(`获取的IP格式无效: ${ip}，第${retryCount}次重试`);
                            resolve('');
                        }
                    });
                });
                
                if (!this.isValidIP(newIp) && retryCount < MAX_IP_RETRY) {
                    await $.wait(2000); // 等待2秒再重试
                }
            } catch (e) {
                this.log(`IP获取异常: ${e}, 第${retryCount}次重试`);
            }
        }
        
        if (!this.isValidIP(newIp)) {
            this.ipError = true;
            this.logMessage(`❌ 错误: 无法获取有效IP地址，最多重试${MAX_IP_RETRY}次`);
            return false;
        }
        
        if (currentIp && newIp && newIp !== currentIp) {
            this.ipChanged = true;
            this.logMessage(`⚠️ 检测到IP变化: ${currentIp} -> ${newIp}`);
        }
        
        currentIp = newIp;
        return true;
    }
    
    async requestApi(url, description) {
        return new Promise((resolve, reject) => {
            this.log(`请求 ${description}`);
            $.get({ url }, (err, resp, data) => {
                if (err) {
                    this.logMessage(`❌ ${description}失败: ${err}`);
                    reject(err);
                    return;
                }
                resolve(data);
            });
        });
    }
    
    async checkAccountResources(uid, ukey) {
        try {
            const data = await this.requestApi(
                `http://op.xiequ.cn/ApiUser.aspx?act=suitdt&uid=${uid}&ukey=${ukey}`,
                "查询账号剩余IP/流量"
            );
            
            const res = JSON.parse(data);
            if (res.success === "true") {
                const validResource = res.data.find(x => x.valid === 'true');
                if (validResource) {
                    this.quantity = validResource.num - validResource.use;
                    const status = {
                        uid,
                        quantity: this.quantity,
                        insufficient: this.quantity < NOTIFY_THRESHOLD
                    };
                    this.accountStatus.push(status);
                    this.currentAccount = status;
                    
                    this.log(`📊 剩余流量/IP: ${this.quantity}`);
                    
                    if (this.quantity < NOTIFY_THRESHOLD) {
                        this.needNotify = true;
                        this.logMessage(`⚠️ 警告: 流量/IP不足${NOTIFY_THRESHOLD}!`);
                    }
                    if (this.quantity > 0) {
                        this.allAccountsNoFlow = false;
                    }
                    return true;
                }
            }
            this.log(`❌ 获取账号资源失败: ${data}`);
        } catch (e) {
            this.log(`❌ 解析账号资源数据失败: ${e}`);
        }
        return false;
    }
    
    async clearAllWhitelists() {
        this.logMessage("♻️ 正在清除所有账号的白名单...");
        const deletePromises = this.cookies.map((cookie, index) => {
            const [uid, ukey] = cookie.split("##");
            return new Promise(resolve => {
                setTimeout(async () => {
                    const result = await this.requestApi(
                        `http://op.xiequ.cn/IpWhiteList.aspx?act=del&ip=all&uid=${uid}&ukey=${ukey}`,
                        `清除账号[${index}-${uid}]白名单`
                    );
                    this.logMessage(`✔️ 已清除账号[${index}-${uid}]白名单: ${result}`);
                    resolve();
                }, 1500 * (index + 1));
            });
        });
        await Promise.all(deletePromises);
    }
    
    async updateWhitelist(uid, ukey) {
        if (!this.isValidIP(currentIp)) {
            this.logMessage(`❌ 无效IP地址: ${currentIp}，跳过白名单更新`);
            return false;
        }
        
        this.logMessage("🔄 正在更新账号白名单...");
        const data = await this.requestApi(
            `http://op.xiequ.cn/IpWhiteList.aspx?act=add&ip=${currentIp}&uid=${uid}&ukey=${ukey}`,
            "添加新白名单"
        );
        this.logMessage(`✅ 白名单更新结果: ${data}`);
        this.whitelistUpdated = true;
        return data !== 'Err:IpFormat';
    }
    
    async checkWhitelist(uid, ukey) {
        try {
            const data = await this.requestApi(
                `http://op.xiequ.cn/IpWhiteList.aspx?act=get&uid=${uid}&ukey=${ukey}`,
                "获取白名单列表"
            );
            
            if (data && this.isValidIP(currentIp) && data.includes(currentIp)) {
                this.log("✅ 当前IP已在白名单中");
                return true;
            }
            this.logMessage(`❌ 检测到IP不在白名单中: ${data || '无记录'} -> ${currentIp}`);
            return false;
        } catch (e) {
            this.logMessage("❌ 白名单检查失败，默认为新IP");
            return false;
        }
    }
    
    generateAccountReport() {
        let report = "📊 账号流量状态报告(账号索引-账号ID):\n";
        this.accountStatus.forEach((account, index) => {
            report += `├─ ${index}-[${account.uid}] 剩余流量/IP: ${account.quantity}`;
            if (account.insufficient) {
                report += " ❗(流量不足)";
            }
            report += "\n";
        });
        return report;
    }
    
    async processAccounts() {
        console.log(`\n===== 开始处理账号 =====`);
        this.notifyMsg = `==============📣系统通知📣==============\n`;
        this.notifyMsg += `携趣多账号顺序更新白名单\n\n`;
        this.notifyMsg += `📊 共管理 ${this.cookies.length} 个账号\n\n`;
        
        const ipResult = await this.fetchCurrentIP();
        
        if (!ipResult) {
            this.notifyMsg += `❌ 错误: 无法获取有效IP地址，请检查网络连接\n`;
            globalNotifyMsg += this.notifyMsg;
            return;
        }
        
        if (currentIp) {
            this.notifyMsg += `🌐 当前检测IP: ${currentIp}\n\n`;
        } else {
            this.notifyMsg += `❌ 警告: 未检测到当前IP\n\n`;
        }
        
        for (let i = 0; i < this.cookies.length; i++) {
            this.accountIndex = i;
            const [uid, ukey] = this.cookies[i].split("##");
            this.currentAccount = null;
            const hasResources = await this.checkAccountResources(uid, ukey);
            
            if (hasResources && this.quantity > MIN_COUNT) {
                this.hasValidAccount = true;
                
                if (!this.isValidIP(currentIp)) {
                    this.logMessage("⚠️ 跳过白名单检查：当前IP无效");
                    continue;
                }
                
                const isWhitelisted = await this.checkWhitelist(uid, ukey);
                
                if (!isWhitelisted || this.ipChanged) {
                    await this.clearAllWhitelists();
                    await this.updateWhitelist(uid, ukey);
                    break;
                }
                this.log("✅ 当前白名单配置正确");
                break;
            }
        }
        
        this.notifyMsg += this.generateAccountReport() + "\n";
        
        // 判定是否需要通知的四种情况
        if (this.ipChanged || this.whitelistUpdated || this.allAccountsNoFlow || this.needNotify || this.ipError) {
            if (this.allAccountsNoFlow) {
                this.notifyMsg += "❌ 警告: 所有账号都没有可用流量/IP!\n";
            }
            if (this.ipError) {
                this.notifyMsg += "❌ 严重: IP获取失败，请检查网络连接!\n";
            }
            globalNotifyMsg += this.notifyMsg;
        }
    }
}
!(async () => {
    console.log(`\n\n===== 脚本执行 - ${new Date().toLocaleString()} =====\n`);
    
    if (!evnCookie) {
        console.log("❌ 未找到有效Cookie配置");
        showmsg("❌ 未找到有效Cookie配置");
        return;
    }
    
    const cookies = evnCookie.split("@@").filter(x => x && x.includes("##"));
    if (cookies.length === 0) {
        console.log("❌ Cookie格式错误，请检查配置");
        showmsg("❌ Cookie格式错误，请检查配置");
        return;
    }
    
    const manager = new UserManager(cookies);
    await manager.processAccounts();
    
    if (globalNotifyMsg) {
        showmsg(globalNotifyMsg);
    } else {
        console.log("ℹ️ 状态正常，无需通知");
    }
})().catch(e => {
    console.log(`❌ 脚本执行失败: ${e}`);
    showmsg(e.message);
}).finally(() => {
    $.done();
});
// 发送通知函数
async function showmsg(msg) {
    if (!msg) return;
    
    console.log((msg));
    try {
        var notify = require('./sendNotify');
        await notify.sendNotify(name, msg);
    } catch (e) {
        console.log(`❌ 通知发送失败: ${e.message}`);
    }
}

/*********************************** API *************************************/
function Env(t, e) { "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0); class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, r) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, h] = i.split("@"), n = { url: `http://${h}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(n, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), h = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(h); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) })) } post(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.post(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) }); else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t)); else if (this.isNode()) { this.initGotEnv(t); const { url: s, ...i } = t; this.got.post(s, i).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) } }(t, e) }
/*****************************************************************************/
