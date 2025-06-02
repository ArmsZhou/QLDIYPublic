/*
携趣多账号顺序更新白名单
corn 0/15 * * * *

在IP白名单授权页面复制 uid、ukey
在ip提取页面生成链接复制 vkey

变量名 xiequCk， uid##ukey##vkey,多个账号用@@分割
*/

let name = "携趣多账号顺序更新白名单"
const $ = new Env(name);

let evnCookie = $.isNode() ? (process.env.xiequCk ? process.env.xiequCk : "") : ($.getdata('xiequCk') ? $.getdata('xiequCk') : "")

let notifyBody='';
let currentIp=''
let flag=false
// 少于多少切换白名单
let minCount=10
class UserInfo {
    constructor(cookie,index) {
       
        this.notifyMsg = ''
        this.stop = 0;
        this.index = index;
        this.quantity = 0;
        this.whiteList=""
        this.allCK=[]
    }


    async getIp(){
        this.notify("获取当前ip")
        return new Promise((resolve) => {
            var request = {
                url: "https://4.ipw.cn",
            };
            $.get(request, async (err, resp, data) => {
                try {
                    currentIp = data
					this.notify("当前IP: "+currentIp)
                } catch (e) {
                    this.notify(e);
                    this.notify("\n\n==============================\n\n");
                }finally {
                    resolve()
                }
            });
        });
    }

    async getQuantity(uid,ukey){
        this.notify("获取「IP/流量」剩余数量")
        return new Promise((resolve) => {
            var request = {
                url: `http://op.xiequ.cn/ApiUser.aspx?act=suitdt&uid=${uid}&ukey=${ukey}`,
            };
            $.get(request, async (err, resp, data) => {
                try {
                    data = JSON.parse(data);
                    if (data.success=="true") {
						let a=data.data.find(x=>x.valid=='true')
                        if(a){
                            this.quantity = a.num - a.use
                            this.notify(`剩余数量: ${this.quantity}`)
                        }
                    }else{
                        this.notify(`获取剩余「IP/流量」数量失败: ${JSON.stringify(data)}`)
                    }
                } catch (e) {
                    this.notify(e);
                    this.notify("\n\n==============================\n\n");
                }finally {
                    resolve()
                }
            });
        });
    }

    async delWhiteList(uid,ukey){
        this.notify("删除白名单")
        return new Promise((resolve) => {
            var request = {
                url: `http://op.xiequ.cn/IpWhiteList.aspx?act=del&ip=all&uid=${uid}&ukey=${ukey}`,
            };
            $.get(request, async (err, resp, data) => {
                try {
                    // this.log(data)
                } catch (e) {
                    this.notify(e);
                    this.notify("\n\n==============================\n\n");
                }finally {
                    resolve()
                }
            });
        });
    }

    async getWhiteList(uid,ukey){
        this.notify("获取白名单")
        return new Promise((resolve) => {
            var request = {
                url: `http://op.xiequ.cn/IpWhiteList.aspx?act=get&uid=${uid}&ukey=${ukey}`,
            };
            $.get(request, async (err, resp, data) => {
                try {
                    this.whiteList = data
                    this.notify(`现有白名单: ${JSON.stringify(data)}`)
                } catch (e) {
                    this.notify(e);
                    this.notify("\n\n==============================\n\n");
                }finally {
                    resolve()
                }
            });
        });
    }

    async addWhiteList(uid,ukey){
        this.notify("添加白名单")
        return new Promise((resolve) => {
            var request = {
                url: `http://op.xiequ.cn/IpWhiteList.aspx?act=add&ip=${currentIp}&uid=${uid}&ukey=${ukey}`,
            };
            $.get(request, async (err, resp, data) => {
                try {
                    this.notify(`添加白名单: ${JSON.stringify(data)}`)
                } catch (e) {
                    this.notify(e);
                    this.notify("\n\n==============================\n\n");
                }finally {
                    resolve()
                }
            });
        });
    }


    async exce() {
        return new Promise(async (resolve) => {
            try{
                let ckArr = formatCK();
                if (!ckArr || !ckArr.length) {
                    console.log("没有找到有效的CK");
                    this.notifyMsg += `没有找到有效的CK\n`
                } else {
                    console.log(`总共${ckArr.length}个账号`)
                    this.notifyMsg += `总共${ckArr.length}个账号\n`
                    this.allCK = ckArr
                    await this.getIp()
                    for (let i in ckArr) {
                        let uid = ckArr[i].split("##")[0];
                        let ukey = ckArr[i].split("##")[1];
                        let vkey= ckArr[i].split("##")[2]
                        await this.getQuantity(uid,ukey)
                        if(this.quantity>minCount){
                            await this.getWhiteList(uid,ukey)
                            await $.wait(1500)
                            if(!this.whiteList.includes(currentIp)){
                                this.log("账号白名单不包含当前ip，重新添加白名单")
                                for (let i in ckArr){
                                    await this.delWhiteList(ckArr[i].split("##")[0],ckArr[i].split("##")[1])
                                    await $.wait(1500)
                                }
                                await $.wait(1500)
                                await this.addWhiteList(uid,ukey)   
                                break;
                            }else{
                                this.notify("账号IP白名单包含当前ip，不用更新")
                                break
                            }
                        }else{
                            this.notify("剩余「IP/流量」数量不足，删除该账号白名单")
                            await this.delWhiteList(uid,ukey)
                        }
                        this.index = this.index+1
                    }
                }

            }finally {
                showmsg(this.notifyMsg)
                resolve();
            }
        });
    }

    log(msg){
        let uid = this.allCK[this.index].split("##")[0];
        $.log(`账号${this.index}-[${uid}]: ${msg}`);
    }

    notify(msg) {
        let uid = this.allCK[this.index].split("##")[0];
        $.log(`账号${this.index}-[${uid}]: ${msg}`);
        this.notifyMsg +=`账号${this.index}-[${uid}]: ${msg}\n`;
    }

    delay(min,max){
        let ms=Math.floor(Math.random() * (max - min + 1)) + min
        this.log(`等待${ms/1000}秒`)
        return ms
    }

}


!(async () => {
    console.log(
        `\n\n=====脚本执行 - 北京时间(UTC+8)：${new Date(
            new Date().getTime() +
            new Date().getTimezoneOffset() * 60 * 1000 +
            8 * 60 * 60 * 1000
        ).toLocaleString()}=====\n`
    );
    let ckArr = formatCK();
    if (!ckArr || !ckArr.length) {
        console.log("没有找到有效的CK");
    } else {
        let userInfo = new UserInfo(0,0)
        await userInfo.exce();
    
    }
})()
    .catch((e) => {
        console.log("", `❌失败! 原因: ${e}!`, "");
    })
    .finally(() => {
        showmsg(notifyBody)
        $.done();
    });


function formatCK() {
    if (!evnCookie) {
        return evnCookie
    }
    return evnCookie.split("@@").map(x=>{
        return x;
    });
}

async function showmsg(msg) {
    if(!msg) return;
    let sendMsgStr = " 运行通知\n\n" + msg
    if($.isNode()){
        var notify = require('./sendNotify');
        console.log('\n============== 推送 ==============')
        await notify.sendNotify(name, sendMsgStr);
    } else {
        $.msg(sendMsgStr);
    }
}

/*********************************** API *************************************/
function Env(t, e) { "undefined" != typeof process && JSON.stringify(process.env).indexOf("GITHUB") > -1 && process.exit(0); class s { constructor(t) { this.env = t } send(t, e = "GET") { t = "string" == typeof t ? { url: t } : t; let s = this.get; return "POST" === e && (s = this.post), new Promise((e, i) => { s.call(this, t, (t, s, r) => { t ? i(t) : e(s) }) }) } get(t) { return this.send.call(this.env, t) } post(t) { return this.send.call(this.env, t, "POST") } } return new class { constructor(t, e) { this.name = t, this.http = new s(this), this.data = null, this.dataFile = "box.dat", this.logs = [], this.isMute = !1, this.isNeedRewrite = !1, this.logSeparator = "\n", this.startTime = (new Date).getTime(), Object.assign(this, e), this.log("", `🔔${this.name}, 开始!`) } isNode() { return "undefined" != typeof module && !!module.exports } isQuanX() { return "undefined" != typeof $task } isSurge() { return "undefined" != typeof $httpClient && "undefined" == typeof $loon } isLoon() { return "undefined" != typeof $loon } toObj(t, e = null) { try { return JSON.parse(t) } catch { return e } } toStr(t, e = null) { try { return JSON.stringify(t) } catch { return e } } getjson(t, e) { let s = e; const i = this.getdata(t); if (i) try { s = JSON.parse(this.getdata(t)) } catch { } return s } setjson(t, e) { try { return this.setdata(JSON.stringify(t), e) } catch { return !1 } } getScript(t) { return new Promise(e => { this.get({ url: t }, (t, s, i) => e(i)) }) } runScript(t, e) { return new Promise(s => { let i = this.getdata("@chavy_boxjs_userCfgs.httpapi"); i = i ? i.replace(/\n/g, "").trim() : i; let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout"); r = r ? 1 * r : 20, r = e && e.timeout ? e.timeout : r; const [o, h] = i.split("@"), n = { url: `http://${h}/v1/scripting/evaluate`, body: { script_text: t, mock_type: "cron", timeout: r }, headers: { "X-Key": o, Accept: "*/*" } }; this.post(n, (t, e, i) => s(i)) }).catch(t => this.logErr(t)) } loaddata() { if (!this.isNode()) return {}; { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e); if (!s && !i) return {}; { const i = s ? t : e; try { return JSON.parse(this.fs.readFileSync(i)) } catch (t) { return {} } } } } writedata() { if (this.isNode()) { this.fs = this.fs ? this.fs : require("fs"), this.path = this.path ? this.path : require("path"); const t = this.path.resolve(this.dataFile), e = this.path.resolve(process.cwd(), this.dataFile), s = this.fs.existsSync(t), i = !s && this.fs.existsSync(e), r = JSON.stringify(this.data); s ? this.fs.writeFileSync(t, r) : i ? this.fs.writeFileSync(e, r) : this.fs.writeFileSync(t, r) } } lodash_get(t, e, s) { const i = e.replace(/\[(\d+)\]/g, ".$1").split("."); let r = t; for (const t of i) if (r = Object(r)[t], void 0 === r) return s; return r } lodash_set(t, e, s) { return Object(t) !== t ? t : (Array.isArray(e) || (e = e.toString().match(/[^.[\]]+/g) || []), e.slice(0, -1).reduce((t, s, i) => Object(t[s]) === t[s] ? t[s] : t[s] = Math.abs(e[i + 1]) >> 0 == +e[i + 1] ? [] : {}, t)[e[e.length - 1]] = s, t) } getdata(t) { let e = this.getval(t); if (/^@/.test(t)) { const [, s, i] = /^@(.*?)\.(.*?)$/.exec(t), r = s ? this.getval(s) : ""; if (r) try { const t = JSON.parse(r); e = t ? this.lodash_get(t, i, "") : e } catch (t) { e = "" } } return e } setdata(t, e) { let s = !1; if (/^@/.test(e)) { const [, i, r] = /^@(.*?)\.(.*?)$/.exec(e), o = this.getval(i), h = i ? "null" === o ? null : o || "{}" : "{}"; try { const e = JSON.parse(h); this.lodash_set(e, r, t), s = this.setval(JSON.stringify(e), i) } catch (e) { const o = {}; this.lodash_set(o, r, t), s = this.setval(JSON.stringify(o), i) } } else s = this.setval(t, e); return s } getval(t) { return this.isSurge() || this.isLoon() ? $persistentStore.read(t) : this.isQuanX() ? $prefs.valueForKey(t) : this.isNode() ? (this.data = this.loaddata(), this.data[t]) : this.data && this.data[t] || null } setval(t, e) { return this.isSurge() || this.isLoon() ? $persistentStore.write(t, e) : this.isQuanX() ? $prefs.setValueForKey(t, e) : this.isNode() ? (this.data = this.loaddata(), this.data[e] = t, this.writedata(), !0) : this.data && this.data[e] || null } initGotEnv(t) { this.got = this.got ? this.got : require("got"), this.cktough = this.cktough ? this.cktough : require("tough-cookie"), this.ckjar = this.ckjar ? this.ckjar : new this.cktough.CookieJar, t && (t.headers = t.headers ? t.headers : {}, void 0 === t.headers.Cookie && void 0 === t.cookieJar && (t.cookieJar = this.ckjar)) } get(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); t.headers && (delete t.headers["Content-Type"], delete t.headers["Content-Length"]), this.isSurge() || this.isLoon() ? (this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.get(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) })) : this.isQuanX() ? (this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t))) : this.isNode() && (this.initGotEnv(t), this.got(t).on("redirect", (t, e) => { try { if (t.headers["set-cookie"]) { const s = t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString(); s && this.ckjar.setCookieSync(s, null), e.cookieJar = this.ckjar } } catch (t) { this.logErr(t) } }).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) })) } post(t, e = (() => { })) {Object.assign(t,{https: { rejectUnauthorized: false}}); if (t.body && t.headers && !t.headers["Content-Type"] && (t.headers["Content-Type"] = "application/x-www-form-urlencoded"), t.headers && delete t.headers["Content-Length"], this.isSurge() || this.isLoon()) this.isSurge() && this.isNeedRewrite && (t.headers = t.headers || {}, Object.assign(t.headers, { "X-Surge-Skip-Scripting": !1 })), $httpClient.post(t, (t, s, i) => { !t && s && (s.body = i, s.statusCode = s.status), e(t, s, i) }); else if (this.isQuanX()) t.method = "POST", this.isNeedRewrite && (t.opts = t.opts || {}, Object.assign(t.opts, { hints: !1 })), $task.fetch(t).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => e(t)); else if (this.isNode()) { this.initGotEnv(t); const { url: s, ...i } = t; this.got.post(s, i).then(t => { const { statusCode: s, statusCode: i, headers: r, body: o } = t; e(null, { status: s, statusCode: i, headers: r, body: o }, o) }, t => { const { message: s, response: i } = t; e(s, i, i && i.body) }) } } time(t, e = null) { const s = e ? new Date(e) : new Date; let i = { "M+": s.getMonth() + 1, "d+": s.getDate(), "H+": s.getHours(), "m+": s.getMinutes(), "s+": s.getSeconds(), "q+": Math.floor((s.getMonth() + 3) / 3), S: s.getMilliseconds() }; /(y+)/.test(t) && (t = t.replace(RegExp.$1, (s.getFullYear() + "").substr(4 - RegExp.$1.length))); for (let e in i) new RegExp("(" + e + ")").test(t) && (t = t.replace(RegExp.$1, 1 == RegExp.$1.length ? i[e] : ("00" + i[e]).substr(("" + i[e]).length))); return t } msg(e = t, s = "", i = "", r) { const o = t => { if (!t) return t; if ("string" == typeof t) return this.isLoon() ? t : this.isQuanX() ? { "open-url": t } : this.isSurge() ? { url: t } : void 0; if ("object" == typeof t) { if (this.isLoon()) { let e = t.openUrl || t.url || t["open-url"], s = t.mediaUrl || t["media-url"]; return { openUrl: e, mediaUrl: s } } if (this.isQuanX()) { let e = t["open-url"] || t.url || t.openUrl, s = t["media-url"] || t.mediaUrl; return { "open-url": e, "media-url": s } } if (this.isSurge()) { let e = t.url || t.openUrl || t["open-url"]; return { url: e } } } }; if (this.isMute || (this.isSurge() || this.isLoon() ? $notification.post(e, s, i, o(r)) : this.isQuanX() && $notify(e, s, i, o(r))), !this.isMuteLog) { let t = ["", "==============📣系统通知📣=============="]; t.push(e), s && t.push(s), i && t.push(i), console.log(t.join("\n")), this.logs = this.logs.concat(t) } } log(...t) { t.length > 0 && (this.logs = [...this.logs, ...t]), console.log(t.join(this.logSeparator)) } logErr(t, e) { const s = !this.isSurge() && !this.isQuanX() && !this.isLoon(); s ? this.log("", `❗️${this.name}, 错误!`, t.stack) : this.log("", `❗️${this.name}, 错误!`, t) } wait(t) { return new Promise(e => setTimeout(e, t)) } done(t = {}) { const e = (new Date).getTime(), s = (e - this.startTime) / 1e3; this.log("", `🔔${this.name}, 结束! 🕛 ${s} 秒`), this.log(), (this.isSurge() || this.isQuanX() || this.isLoon()) && $done(t) } }(t, e) }
/*****************************************************************************/
