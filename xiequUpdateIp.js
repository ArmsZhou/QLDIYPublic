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

let currentIp = '';
let globalNotifyMsg = '';
let shouldNotify = false;

class UserManager {
    constructor(cookies) {
        this.cookies = cookies;
        this.accountIndex = 0;
        this.quantity = 0;
        this.whiteList = "";
        this.needNotify = false;
        this.notifyMsg = '';
    }

    log(msg) {
        const uid = this.getCurrentUID();
        $.log(`账号${this.accountIndex}-[${uid}]: ${msg}`);
    }

    logMessage(msg) {
        this.log(msg);
        this.notifyMsg += `账号${this.accountIndex}: ${msg}\n`;
    }

    getCurrentUID() {
        return this.cookies[this.accountIndex].split("##")[0] || '未知账号';
    }

    async fetchCurrentIP() {
        return new Promise((resolve) => {
            $.get({ url: "https://4.ipw.cn" }, (err, resp, data) => {
                currentIp = data.trim();
                if (!globalNotifyMsg.includes(currentIp)) {
                    this.logMessage(`📢当前外部IP地址: ${currentIp}`);
                }
                resolve();
            });
        });
    }

    async requestApi(url, description) {
        return new Promise((resolve, reject) => {
            this.log(`请求 ${description}`);
            $.get({ url }, (err, resp, data) => {
                if (err) {
                    this.logMessage(`❌${description}失败: ${err}`);
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
                    this.logMessage(`剩余流量/IP: ${this.quantity}`);
                    
                    // 检测流量不足通知条件
                    if (this.quantity < NOTIFY_THRESHOLD) {
                        this.needNotify = true;
                        this.logMessage(`⚠️警告: 流量/IP不足${NOTIFY_THRESHOLD}!`);
                    }
                    return true;
                }
            }
            this.logMessage(`❌获取账号资源失败: ${data}`);
        } catch (e) {
            this.logMessage(`❌解析账号资源数据失败: ${e}`);
        }
        return false;
    }

    async clearAllWhitelists() {
        this.logMessage("♻️ 正在清除所有账号的白名单...");
        const deletePromises = this.cookies.map(cookie => {
            const [uid, ukey] = cookie.split("##");
            return new Promise(resolve => {
                setTimeout(async () => {
                    await this.requestApi(
                        `http://op.xiequ.cn/IpWhiteList.aspx?act=del&ip=all&uid=${uid}&ukey=${ukey}`,
                        `清除账号[${uid}]白名单`
                    );
                    resolve();
                }, 1500); // 延迟避免频繁请求
            });
        });
        await Promise.all(deletePromises);
    }

    async updateWhitelist(uid, ukey) {
        this.logMessage("🔄 正在更新账号白名单...");
        const data = await this.requestApi(
            `http://op.xiequ.cn/IpWhiteList.aspx?act=add&ip=${currentIp}&uid=${uid}&ukey=${ukey}`,
            "添加新白名单"
        );
        this.logMessage(`白名单更新结果: ${data}`);
        
        // 触发通知条件1：检测到IP变化
        this.needNotify = true;
        shouldNotify = true;
    }

    async checkWhitelist(uid, ukey) {
        try {
            const data = await this.requestApi(
                `http://op.xiequ.cn/IpWhiteList.aspx?act=get&uid=${uid}&ukey=${ukey}`,
                "获取白名单列表"
            );
            
            if (data.includes(currentIp)) {
                this.logMessage("✅ 当前IP已在白名单中");
                return true;
            }
            this.logMessage(`❌检测到IP变化: ${data || '无记录'} -> ${currentIp}`);
            return false;
        } catch (e) {
            this.logMessage("❌白名单检查失败，默认为新IP");
            return false;
        }
    }

    async processAccounts() {
        await this.fetchCurrentIP();

        // 处理每个账号
        for (let i = 0; i < this.cookies.length; i++) {
            this.accountIndex = i;
            const [uid, ukey] = this.cookies[i].split("##");

            // 1. 查询账号资源
            const hasResources = await this.checkAccountResources(uid, ukey);
            
            // 2. 资源充足时处理白名单
            if (hasResources && this.quantity > MIN_COUNT) {
                const isWhitelisted = await this.checkWhitelist(uid, ukey);
                
                if (!isWhitelisted) {
                    await this.clearAllWhitelists();
                    await this.updateWhitelist(uid, ukey);
                    break; // 成功更新后终止循环
                }
                this.logMessage("✅ 当前白名单配置正确");
                break; // IP正确无需后续处理
            }
            
            // 3. 资源不足时清理白名单
            if (hasResources && this.quantity <= MIN_COUNT) {
                await this.requestApi(
                    `http://op.xiequ.cn/IpWhiteList.aspx?act=del&ip=all&uid=${uid}&ukey=${ukey}`,
                    "清除资源不足账号"
                );
                this.logMessage("♻️ 已清理资源不足账号的白名单");
            }
        }
        
        // 汇总所有需要通知的消息
        if (this.needNotify) {
            globalNotifyMsg += this.notifyMsg + "\n";
            shouldNotify = true;
        }
    }
}

!(async () => {
    console.log(`\n\n===== 脚本执行 - ${new Date().toLocaleString()} =====\n`);
    
    if (!evnCookie) {
        console.log("❌ 未找到有效Cookie配置");
        return;
    }
    
    const cookies = evnCookie.split("@@").filter(x => x && x.includes("##"));
    if (cookies.length === 0) {
        console.log("❌ Cookie格式错误，请检查配置");
        return;
    }
    
    const manager = new UserManager(cookies);
    await manager.processAccounts();
    
    // 满足通知条件时才发送
    if (shouldNotify) {
        $.msg(globalNotifyMsg);
    } else {
        console.log("ℹ️ 状态正常，无需通知");
    }
})().catch(e => {
    console.log(`❌ 脚本执行失败: ${e}`);
}).finally(() => {
    $.done();
});

/*********************************** API *************************************/
function Env(t, e) { "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0); class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, r) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, h] = i.split("@"), n = { url: `http://${h}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(n, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), h = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(h); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) })) } post(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.post(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) }); else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t)); else if (this.isNode()) { this.initGotEnv(t); const { url: s, ...i } = t; this.got.post(s, i).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) } }(t, e) }
/*****************************************************************************/
