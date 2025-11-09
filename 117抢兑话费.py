import subprocess
import sys
import asyncio
import aiohttp
import os
import execjs
import requests
import re
import time as time_module
import json
import random
import datetime
import base64
import ssl
import certifi
import traceback
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5
from Crypto.Cipher import DES3
from Crypto.Util.Padding import pad, unpad
from Crypto.Cipher import AES
from http import cookiejar
from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.ssl_ import create_urllib3_context

# ==========================================
# 🎯 初始化配置和常量定义
# ==========================================

def print_banner():
    """打印漂亮的横幅"""
    banner = """
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║    🎉 电信金豆兑换话费自动化脚本 🎉                            ║
║                                                                ║
║    ✨ 功能特点:                                                ║
║       • 多账号并发处理                                        ║
║       • 智能时间同步                                          ║
║       • 实时状态监控                                          ║
║       • 微信消息推送                                          ║
║                                                                ║
║    📝 作者: 自动化脚本                                        ║
║    🕒 运行时间: 上午9:30 / 下午13:30                          ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
    """
    print(banner)

def print_section(title):
    """打印章节标题"""
    print(f"\n{'='*60}")
    print(f"🎯 {title}")
    print(f"{'='*60}")

def print_info(message):
    """打印信息日志"""
    current_time = get_network_time().strftime("%H:%M:%S.%f")[:-3]
    print(f"🕒 {current_time} 💙 INFO: {message}")

def print_success(message):
    """打印成功日志"""
    current_time = get_network_time().strftime("%H:%M:%S.%f")[:-3]
    print(f"🕒 {current_time} 💚 SUCCESS: {message}")

def print_warning(message):
    """打印警告日志"""
    current_time = get_network_time().strftime("%H:%M:%S.%f")[:-3]
    print(f"🕒 {current_time} 💛 WARNING: {message}")

def print_error(message):
    """打印错误日志"""
    current_time = get_network_time().strftime("%H:%M:%S.%f")[:-3]
    print(f"🕒 {current_time} ❌ ERROR: {message}")

def print_debug(message):
    """打印调试日志"""
    current_time = get_network_time().strftime("%H:%M:%S.%f")[:-3]
    print(f"🕒 {current_time} 🔍 DEBUG: {message}")

# ==========================================
# 🔧 核心功能函数
# ==========================================

def get_network_time():
    """从淘宝接口获取网络时间"""
    url = "https://acs.m.taobao.com/gw/mtop.common.getTimestamp/"
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if "data" in data and "t" in data["data"]:
                timestamp = int(data["data"]["t"])
                return datetime.datetime.fromtimestamp(timestamp / 1000)
            else:
                raise ValueError("接口返回数据格式错误")
        else:
            raise Exception(f"获取网络时间失败，状态码: {response.status_code}")
    except Exception as e:
        print_warning(f"获取网络时间失败，使用本地时间: {e}")
        return datetime.datetime.now()

# 初始化配置
print_banner()
print_section("脚本初始化")

# 获取本地时间和网络时间
local_time = datetime.datetime.now()
network_time = get_network_time()
time_diff = network_time - local_time

print_info(f"本地系统时间: {local_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
print_info(f"网络标准时间: {network_time.strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]}")
print_info(f"时间校准差异: {time_diff.total_seconds():.3f} 秒")

# 默认兑换策略
MEXZ = os.getenv("MEXZ")

# 定义时间段
morning_start = datetime.time(9, 30, 3)
morning_end = datetime.time(10, 10, 30)
afternoon_start = datetime.time(13, 30, 3)
afternoon_end = datetime.time(14, 10, 30)

# 获取当前时间
now = get_network_time().time()

# 判断当前时间是否在指定的时间段内
if (morning_start <= now <= morning_end) or (afternoon_start <= now <= afternoon_end):
    if not MEXZ:
        MEXZ = "0.5,5,6;1,10,3"
    print_success("当前处于兑换时间段内，使用配置策略")
else:
    MEXZ = "0.5,5,6;1,10,3"
    print_warning("当前不在兑换时间段，使用默认策略")

# 解析 MEXZ 配置
morning_exchanges, afternoon_exchanges = MEXZ.split(';')
morning_exchanges = [f"{x}元话费" for x in morning_exchanges.split(',')]
afternoon_exchanges = [f"{x}元话费" for x in afternoon_exchanges.split(',')]

print_info(f"上午兑换策略: {morning_exchanges}")
print_info(f"下午兑换策略: {afternoon_exchanges}")

# 从环境变量中获取代理池地址
DY_PROXY = os.getenv("DY_PROXY123")

# 获取循环次数配置
OUTER_LOOP_COUNT = int(os.getenv("OUTER_LOOP_COUNT", "20"))
INNER_LOOP_COUNT = int(os.getenv("INNER_LOOP_COUNT", "10"))

print_info(f"外层循环次数: {OUTER_LOOP_COUNT}")
print_info(f"内层循环次数: {INNER_LOOP_COUNT}")

# ==========================================
# 🔄 代理池功能
# ==========================================

async def get_proxy_from_pool():
    """从代理池获取代理IP"""
    if not DY_PROXY:
        raise ValueError("DY_PROXY 环境变量未设置")

    async with aiohttp.ClientSession() as session:
        async with session.get(DY_PROXY) as response:
            if response.status != 200:
                raise Exception(f"从代理池获取代理IP失败，状态码: {response.status}")
            proxy_ip = await response.text()
            return proxy_ip.strip()

# ==========================================
# 🛡️ 安全相关类定义
# ==========================================

class BlockAll(cookiejar.CookiePolicy):
    """阻止所有Cookie"""
    return_ok = set_ok = domain_return_ok = path_return_ok = lambda self, *args, **kwargs: False
    netscape = True
    rfc2965 = hide_cookie2 = False

class DESAdapter(HTTPAdapter):
    """自定义SSL适配器"""
    def __init__(self, *args, **kwargs):
        CIPHERS = 'DEFAULT@SECLEVEL=1'.split(':')
        random.shuffle(CIPHERS)
        CIPHERS = ':'.join(CIPHERS)
        self.CIPHERS = CIPHERS + ':!aNULL:!eNULL:!MD5'
        super().__init__(*args, **kwargs)

    def init_poolmanager(self, *args, **kwargs):
        context = create_urllib3_context(ciphers=self.CIPHERS)
        context.check_hostname = False
        kwargs['ssl_context'] = context
        return super(DESAdapter, self).init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        context = create_urllib3_context(ciphers=self.CIPHERS)
        context.check_hostname = False
        kwargs['ssl_context'] = context
        return super(DESAdapter, self).proxy_manager_for(*args, **kwargs)

# ==========================================
# 🔐 加密解密函数
# ==========================================

# 加密密钥和配置
key = b'1234567`90koiuyhgtfrdews'
iv = 8 * b'\0'

public_key_b64 = '''-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBkLT15ThVgz6/NOl6s8GNPofdWzWbCkWnkaAm7O2LjkM1H7dMvzkiqdxU02jamGRHLX/ZNMCXHnPcW/sDhiFCBN18qFvy8g6VYb9QtroI09e176s+ZCtiv7hbin2cCTj99iUpnEloZm19lwHyo69u5UMiPMpq0/XKBO8lYhN/gwIDAQAB
-----END PUBLIC KEY-----'''

public_key_data = '''-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC+ugG5A8cZ3FqUKDwM57GM4io6JGcStivT8UdGt67PEOihLZTw3P7371+N47PrmsCpnTRzbTgcupKtUv8ImZalYk65dU8rjC/ridwhw9ffW2LBwvkEnDkkKKRi2liWIItDftJVBiWOh17o6gfbPoNrWORcAdcbpk2L+udld5kZNwIDAQAB
-----END PUBLIC KEY-----'''

def encrypt(text):
    """3DES加密"""
    cipher = DES3.new(key, DES3.MODE_CBC, iv)
    ciphertext = cipher.encrypt(pad(text.encode(), DES3.block_size))
    return ciphertext.hex()

def decrypt(text):
    """3DES解密"""
    ciphertext = bytes.fromhex(text)
    cipher = DES3.new(key, DES3.MODE_CBC, iv)
    plaintext = unpad(cipher.decrypt(ciphertext), DES3.block_size)
    return plaintext.decode()

def b64(plaintext):
    """RSA加密后Base64编码"""
    public_key = RSA.import_key(public_key_b64)
    cipher = PKCS1_v1_5.new(public_key)
    ciphertext = cipher.encrypt(plaintext.encode())
    return base64.b64encode(ciphertext).decode()

def encrypt_para(plaintext):
    """参数加密"""
    public_key = RSA.import_key(public_key_data)
    cipher = PKCS1_v1_5.new(public_key)
    ciphertext = cipher.encrypt(plaintext.encode())
    return ciphertext.hex()

def encode_phone(text):
    """手机号编码"""
    encoded_chars = []
    for char in text:
        encoded_chars.append(chr(ord(char) + 2))
    return ''.join(encoded_chars)

def ophone(t):
    """AES ECB模式加密"""
    key = b'34d7cb0bcdf07523'
    utf8_t = t.encode('utf-8')
    cipher = AES.new(key, AES.MODE_ECB)
    ciphertext = cipher.encrypt(pad(utf8_t, AES.block_size))
    return ciphertext.hex()

def aes_ecb_encrypt(plaintext, key):
    """AES ECB加密"""
    key = key.encode('utf-8')
    if len(key) not in [16, 24, 32]:
        raise ValueError("密钥长度必须为16/24/32字节")

    padded_data = pad(plaintext.encode('utf-8'), AES.block_size)
    cipher = AES.new(key, AES.MODE_ECB)
    ciphertext = cipher.encrypt(padded_data)
    return base64.b64encode(ciphertext).decode('utf-8')

# ==========================================
# 📧 消息推送功能
# ==========================================

def send(uid, content):
    """微信消息推送"""
    appToken = os.getenv("WXPUSHER_APP_TOKEN")
    uid = os.getenv("WXPUSHER_UID")

    if not appToken or not uid:
        raise ValueError("WXPUSHER_APP_TOKEN 或 WXPUSHER_UID 未设置")

    try:
        r = requests.post('https://wxpusher.zjiecode.com/api/send/message',
                         json={"appToken": appToken, "content": content, 
                               "contentType": 1, "uids": [uid]}, timeout=10).json()
        return r
    except Exception as e:
        print_error(f"微信推送失败: {e}")
        return None

# ==========================================
# 🔑 登录认证功能
# ==========================================

def userLoginNormal(phone, password):
    """用户登录"""
    print_info(f"开始登录账号: {phone[:3]}****{phone[-4:]}")
    
    alphabet = 'abcdef0123456789'
    uuid = [''.join(random.sample(alphabet, 8)), ''.join(random.sample(alphabet, 4)),
            '4' + ''.join(random.sample(alphabet, 3)), ''.join(random.sample(alphabet, 4)),
            ''.join(random.sample(alphabet, 12))]
    timestamp = get_network_time().strftime("%Y%m%d%H%M%S")
    loginAuthCipherAsymmertric = 'iPhone 14 15.4.' + uuid[0] + uuid[1] + phone + timestamp + password[:6] + '0$$$0.'

    try:
        r = ss.post('https://appgologin.189.cn:9031/login/client/userLoginNormal',
                   json={"headerInfos": {"code": "userLoginNormal", "timestamp": timestamp,
                                        "broadAccount": "", "broadToken": "",
                                        "clientType": "#10.5.0#channel50#iPhone 14 Pro Max#",
                                        "shopId": "20002", "source": "110003",
                                        "sourcePassword": "Sid98s", "token": "",
                                        "userLoginName": encode_phone(phone)},
                         "content": {"attach": "test", "fieldData": {"loginType": "4",
                                                                   "accountType": "",
                                                                   "loginAuthCipherAsymmertric": b64(loginAuthCipherAsymmertric),
                                                                   "deviceUid": uuid[0] + uuid[1] + uuid[2],
                                                                   "phoneNum": encode_phone(phone),
                                                                   "isChinatelecom": "0",
                                                                   "systemVersion": "15.4.0",
                                                                   "authentication": encode_phone(password)}}}).json()
    except Exception as e:
        print_error(f"登录请求失败: {e}")
        return False

    if r is None:
        print_error("登录请求失败，返回值为 None")
        return False

    if 'responseData' not in r or r['responseData'] is None:
        print_error(f"登录请求失败，responseData 不存在: {r}")
        return False

    if 'data' not in r['responseData'] or r['responseData']['data'] is None:
        print_error(f"登录请求失败，data 不存在: {r}")
        return False

    if 'loginSuccessResult' not in r['responseData']['data']:
        print_error(f"登录请求失败，loginSuccessResult 不存在: {r}")
        return False

    l = r['responseData']['data']['loginSuccessResult']

    if l:
        load_token[phone] = l
        with open(load_token_file, 'w') as f:
            json.dump(load_token, f)
        ticket = get_ticket(phone, l['userId'], l['token'])
        if ticket:
            print_success(f"账号 {phone[:3]}****{phone[-4:]} 登录成功")
        return ticket

    print_error(f"账号 {phone[:3]}****{phone[-4:]} 登录失败")
    return False

def get_ticket(phone, userId, token):
    """获取ticket"""
    try:
        r = ss.post('https://appgologin.189.cn:9031/map/clientXML',
                   data='<Request><HeaderInfos><Code>getSingle</Code><Timestamp>' + get_network_time().strftime("%Y%m%d%H%M%S") +
                   '</Timestamp><BroadAccount></BroadAccount><BroadToken></BroadToken><ClientType>#9.6.1#channel50#iPhone 14 Pro Max#</ClientType>' +
                   '<ShopId>20002</ShopId><Source>110003</Source><SourcePassword>Sid98s</SourcePassword><Token>' + token +
                   '</Token><UserLoginName>' + phone + '</UserLoginName></HeaderInfos><Content><Attach>test</Attach>' +
                   '<FieldData><TargetId>' + encrypt(userId) + '</TargetId><Url>4a6862274835b451</Url></FieldData></Content></Request>',
                   headers={'user-agent': 'CtClient;10.4.1;Android;13;22081212C;NTQzNzgx!#!MTgwNTgx'})

        tk = re.findall('<Ticket>(.*?)</Ticket>', r.text)
        if len(tk) == 0:
            print_error(f"获取ticket失败: {r.text}")
            return False
        return decrypt(tk[0])
    except Exception as e:
        print_error(f"获取ticket异常: {e}")
        return False

# ==========================================
# 💰 兑换功能
# ==========================================

async def exchange(phone, s, title, aid, uid, amount):
    """执行兑换操作"""
    global h
    masked_phone = phone[:3] + '****' + phone[-4:]
    
    try:
        print_info(f"📱 {masked_phone} 准备兑换 {title}")
        
        now = get_network_time()
        if h is None:
            h = now.hour

        # 时间等待逻辑
        if h == 9:
            first_target_time = now.replace(hour=h, minute=59, second=30, microsecond=0)
        elif h == 13:
            first_target_time = now.replace(hour=h, minute=59, second=30, microsecond=0)

        first_time_diff = (first_target_time - now).total_seconds()
        if 0 <= first_time_diff <= 300:
            print_info(f"📱 {masked_phone} 等待 {first_time_diff:.2f} 秒后开始兑换")
            await asyncio.sleep(first_time_diff)

        # 兑换请求
        url = "https://wapact.189.cn:9001/gateway/standExchange/detailNew/exchange"
        request_start_time = datetime.datetime.now()

        async with s.post(url, json={"activityId": aid}) as r:
            request_end_time = datetime.datetime.now()
            request_duration = (request_end_time - request_start_time).total_seconds()

            print_debug(f"📱 {masked_phone} 请求耗时: {request_duration:.3f}秒")

            if r.status == 412:
                print_warning(f"📱 {masked_phone} 遇到连续412错误，终止兑换")
                return
                
            response_text = await r.text()
            print_debug(f"📱 {masked_phone} 响应状态: {r.status}, 响应内容: {response_text}")
            
            if r.status == 200:
                r_json = await r.json()
                if r_json["code"] == 0:
                    if r_json["biz"] != {} and r_json["biz"]["resultCode"] in errcode:
                        result_msg = errcode[r_json["biz"]["resultCode"]]
                        print_info(f"📱 {masked_phone} {title} {result_msg}")

                        if r_json["biz"]["resultCode"] in ["0", "412"]:
                            if r_json["biz"]["resultCode"] == "0":
                                msg = f"{phone}: {title} 兑换成功 ✨"
                                print_success(f"📱 {masked_phone} {title} 兑换成功")
                                send(uid, msg)
                            if phone not in dhjl[yf][title]:
                                dhjl[yf][title].add(phone)
                                with open('电信金豆换话费.log', 'w') as f:
                                    temp_dhjl = {k: {m: list(n) for m, n in v.items()} for k, v in dhjl.items()}
                                    json.dump(temp_dhjl, f, ensure_ascii=False)
                else:
                    print_error(f"📱 {masked_phone} 兑换异常: {r_json}")
            else:
                print_error(f"📱 {masked_phone} 兑换请求失败: {response_text}")

    except Exception as e:
        print_error(f"📱 {masked_phone} 兑换过程异常: {e}")
        print_debug(f"详细错误: {traceback.format_exc()}")

async def dh(phone, s, title, aid, wt, uid):
    """处理单个商品的兑换"""
    global h
    masked_phone = phone[:3] + '****' + phone[-4:]
    print_info(f"📱 {masked_phone} 开始处理 {title} 兑换")
    
    cs = 0
    tasks = []
    creat_start_time = datetime.datetime.now()
    
    # 创建兑换任务
    while cs < INNER_LOOP_COUNT:
        amount = title.split('元')[0]
        if (h == 9 and title in morning_exchanges) or (h == 13 and title in afternoon_exchanges):
            tasks.append(exchange(phone, s, title, aid, uid, amount))
        else:
            print_warning(f"📱 {masked_phone} {title} 不在当前时间段兑换策略中")
        cs += 1
        await asyncio.sleep(0.3)
        
    creat_end_time = datetime.datetime.now()
    creat_duration = (creat_end_time - creat_start_time).total_seconds()
    print_info(f"📱 {masked_phone} 创建了 {cs} 个兑换任务，用时: {creat_duration:.3f}秒")

    # 等待到指定时间执行
    while wt > get_network_time().timestamp():
        await asyncio.sleep(1)
        
    # 并发执行所有兑换任务
    await asyncio.gather(*tasks)
    print_info(f"📱 {masked_phone} {title} 兑换任务完成")

# ==========================================
# 🎯 主要业务逻辑
# ==========================================

async def ks(phone, ticket, uid):
    """核心兑换流程"""
    global h, wt
    masked_phone = phone[:3] + '****' + phone[-4:]
    print_section(f"开始处理账号: {masked_phone}")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
        "Referer": "https://wapact.189.cn:9001/JinDouMall/JinDouMall_independentDetails.html"
    }

    timeout = aiohttp.ClientTimeout(total=20)
    async with aiohttp.ClientSession(connector=aiohttp.TCPConnector(ssl=ssl_context), 
                                   headers=headers, timeout=timeout) as s:
        try:
            # 登录认证
            login_data = {
                "ticket": ticket,
                "backUrl": "https%3A%2F%2Fwapact.189.cn%3A9001",
                "platformCode": "P201010301",
                "loginType": 2
            }
            encrypted_data = aes_ecb_encrypt(json.dumps(login_data), 'telecom_wap_2018')
            
            max_retries = 3
            retries = 0
            while retries < max_retries:
                try:
                    login_response = await s.post(
                        'https://wapact.189.cn:9001/unified/user/login',
                        data=encrypted_data,
                        headers={
                            "Content-Type": "application/json;charset=UTF-8",
                            "Accept": "application/json, text/javascript, */*; q=0.01"
                        }
                    )

                    if login_response.status == 200:
                        login = await login_response.json()
                        break
                    elif login_response.status == 412:
                        print_warning(f"📱 {masked_phone} 登录失败，第{retries+1}次重试")
                        retries += 1
                        await asyncio.sleep(2 ** retries)
                    else:
                        print_error(f"📱 {masked_phone} 登录请求失败，状态码: {login_response.status}")
                        retries += 1
                        await asyncio.sleep(2 ** retries)

                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    retries += 1
                    print_error(f"📱 {masked_phone} 登录异常，第{retries}次重试: {e}")
                    await asyncio.sleep(2 ** retries)

                    if retries == max_retries:
                        print_error(f"📱 {masked_phone} 登录失败，达到最大重试次数")
                        return await ks(phone, ticket, uid)

            if 'login' in locals() and login['code'] == 0:
                s.headers["Authorization"] = "Bearer " + login["biz"]["token"]
                print_success(f"📱 {masked_phone} 认证成功")

                # 查询金豆余额
                r = await s.get('https://wapact.189.cn:9001/gateway/golden/api/queryInfo')
                r_json = await r.json()
                amountTotal = r_json["biz"]["amountTotal"]
                print_info(f"📱 {masked_phone} 当前金豆余额: {amountTotal} 个")

                # 获取商品列表
                queryBigDataAppGetOrInfo = await s.get('https://wapact.189.cn:9001/gateway/golden/goldGoods/getGoodsList?floorType=0&userType=1&page=1&order=3&tabOrder=')
                queryBigDataAppGetOrInfo_json = await queryBigDataAppGetOrInfo.json()

                if "biz" in queryBigDataAppGetOrInfo_json and "ExchangeGoodslist" in queryBigDataAppGetOrInfo_json["biz"]:
                    for i in queryBigDataAppGetOrInfo_json["biz"]["ExchangeGoodslist"]:
                        if '话费' not in i["title"]:
                            continue
                        for j in morning_exchanges:
                            if j in i["title"]:
                                jp["9"][j] = i["id"]
                        for j in afternoon_exchanges:
                            if j in i["title"]:
                                jp["13"][j] = i["id"]
                    print_info(f"📱 {masked_phone} 商品列表获取成功")
                else:
                    print_error(f"📱 {masked_phone} 获取商品列表失败")

                # 确定当前时间段
                h = get_network_time().hour
                if 11 > h:
                    h = 9
                    print_info("当前为上午场次")
                else:
                    h = 13
                    print_info("当前为下午场次")

                if len(sys.argv) == 2:
                    h = int(sys.argv[1])
                    print_info(f"手动指定场次: {h}")

                d = jp[str(h)]
                wt = t(h) + kswt
                
                # 过滤有效商品
                valid_products = []
                for di in sorted(d.keys(), key=lambda x: float(x.replace('元话费', '')), reverse=True):
                    if phone not in dhjl[yf].get(di, set()):
                       valid_products.append(di)
                       
                print_info(f"📱 {masked_phone} 有效兑换商品: {valid_products}")

                # 执行兑换循环
                for loop in range(OUTER_LOOP_COUNT):
                    print_info(f"📱 {masked_phone} 开始第 {loop + 1}/{OUTER_LOOP_COUNT} 轮兑换")
                    tasks = []
                    for di in valid_products:
                        if wt - time_module.time() > 30 * 60:
                            print_warning("等待时间过长，退出兑换")
                            return
                        tasks.append(dh(phone, s, di, d[di], wt, uid))
                    
                    print_info(f"📱 {masked_phone} 第 {loop + 1} 轮共有 {len(tasks)} 个兑换任务")
                    await asyncio.gather(*tasks)

                    # 轮次间隔
                    if loop < OUTER_LOOP_COUNT - 1:
                        await asyncio.sleep(0.01)
                        
            else:
                print_error(f"📱 {masked_phone} 获取token失败: {login.get('message', '未知错误')}")
                
        except Exception as e:
            print_error(f"📱 {masked_phone} 兑换流程异常: {e}")
            print_debug(f"详细错误: {traceback.format_exc()}")
            return

# ==========================================
# 🚀 主程序入口
# ==========================================

async def main():
    """主函数"""
    global wt, rs, h
    
    print_section("开始主程序执行")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
        "Referer": "https://wapact.189.cn:9001/JinDouMall/JinDouMall_independentDetails.html"
    }

    timeout = aiohttp.ClientTimeout(total=20)
    rs = 0
    
    # 读取账号配置
    accounts = []
    for key, value in os.environ.items():
        if key == 'chinaTelecomAccount':
            accounts.extend(re.split(r'@|&', value))
            
    if not accounts:
        print_error("未检测到任何账号配置，请检查环境变量")
        return
        
    account_count = len(accounts)
    print_success(f"检测到 {account_count} 个账号")

    # 分批处理账号
    batch_size = 20
    for i in range(0, account_count, batch_size):
        batch_accounts = accounts[i:i + batch_size]
        tasks = []
        print_info(f"处理第 {i//batch_size + 1} 批账号，共 {len(batch_accounts)} 个")
        
        for account in batch_accounts:
            account_info = account.split('#')
            phone = account_info[0]
            password = account_info[1]
            uid = account_info[-1]
            ticket = False
            masked_phone = phone[:3] + '****' + phone[-4:]
            
            if phone in load_token:
                print_info(f'📱 {masked_phone} 使用缓存登录')
                ticket = get_ticket(phone, load_token[phone]['userId'], load_token[phone]['token'])

            if not ticket:
                print_info(f'📱 {masked_phone} 使用密码登录')
                ticket = userLoginNormal(phone, password)

            if ticket:
                tasks.append(ks(phone, ticket, uid))
            else:
                print_error(f'📱 {masked_phone} 登录失败，跳过该账号')
                continue

        # 等待到执行时间
        while wt > datetime.datetime.now().timestamp():
            await asyncio.sleep(1)

        # 并发执行所有账号任务
        await asyncio.gather(*tasks)
        print_success(f"✅ 完成第 {i//batch_size + 1} 批账号处理")
        await asyncio.sleep(2)

# ==========================================
# 📊 全局变量初始化
# ==========================================

# 错误码映射
errcode = {
    "0": "兑换成功 ✨",
    "412": "兑换次数已达上限 💔",
    "413": "商品已兑完 💨",
    "420": "未知错误 😥",
    "410": "该活动未开始 ⏳",
    "501": "服务器处理错误 💻",
    "Y0001": "当前等级不足，去升级兑当前话费 📈",
    "Y0002": "使用翼相连网络600分钟可兑换此奖品 📶",
    "Y0003": "共享流量400M可兑换此奖品 💧",
    "Y0004": "共享流量2GB可兑换此奖品 💧",
    "Y0005": "当前等级不足，去升级兑当前话费 📈",
    "E0001": "您的网龄不足10年，暂不能兑换 ⏳"
}

# 时间函数
def t(h):
    date = get_network_time()
    date_zero = date.replace(hour=h, minute=59, second=20)
    date_zero_time = time_module.mktime(date_zero.timetuple())
    return date_zero_time

# 初始化会话和配置
requests.packages.urllib3.disable_warnings()
ssl_context = ssl.create_default_context()
ssl_context.set_ciphers("DEFAULT@SECLEVEL=1")
ss = requests.session()
ss.verify = certifi.where()
ss.headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; 22081212C Build/TKQ1.220829.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.5112.97 Mobile Safari/537.36",
    "Referer": "https://wapact.189.cn:9001/JinDouMall/JinDouMall_independentDetails.html"
}
ss.mount('https://', DESAdapter())
ss.cookies.set_policy(BlockAll())

# 全局变量
yc = 1
wt = 0
kswt = 0.1
yf = get_network_time().strftime("%Y%m")
ip_list = []
jp = {"9": {}, "13": {}}

# 加载历史记录
try:
    with open('电信金豆换话费.log') as fr:
        dhjl = json.load(fr)
except:
    dhjl = {}

if yf not in dhjl:
    dhjl[yf] = {}
else:
    # 将现有字符串记录转换为集合
    for di in dhjl[yf]:
        if isinstance(dhjl[yf][di], str):
            phone_list = dhjl[yf][di].strip('#').split('#') if dhjl[yf][di] else []
            dhjl[yf][di] = set(phone_list)

# 加载token缓存
load_token_file = 'chinaTelecom_cache.json'
try:
    with open(load_token_file, 'r') as f:
        load_token = json.load(f)
except:
    load_token = {}

# ==========================================
# 📝 程序启动
# ==========================================

START_LOG = '''
╔════════════════════════════════════════════════════════════════╗
║                      🎉 脚本使用说明 🎉                       ║
╠════════════════════════════════════════════════════════════════╣
║ 📋 功能概述:                                                  ║
║   自动兑换中国电信金豆为话费，支持多账号并发处理              ║
║                                                              ║
║ ⚙️ 环境变量配置:                                              ║
║   • chinaTelecomAccount: 手机号#密码#推送UID                 ║
║   • MEXZ: 兑换策略 (默认: "0.5,5,6;1,10,3")                  ║
║   • WXPUSHER_*: 微信推送配置                                ║
║   • OUTER_LOOP_COUNT: 外层循环次数 (默认: 20)                ║
║   • INNER_LOOP_COUNT: 内层循环次数 (默认: 10)                ║
║                                                              ║
🕒 运行时间:                                                    ║
║   • 上午: 09:30:03 - 10:10:30                               ║
║   • 下午: 13:30:03 - 14:10:30                               ║
║                                                              ║
💡 使用步骤:                                                    ║
║   1. 配置环境变量                                            ║
║   2. 安装依赖: pip install requests aiohttp pycryptodome     ║
║   3. 设置定时任务或手动运行                                  ║
║                                                              ║
⚠️ 免责声明:                                                    ║
║   本脚本仅供学习交流，请遵守相关服务条款                    ║
╚════════════════════════════════════════════════════════════════╝
'''

if __name__ == "__main__":
    print(START_LOG)
    print_info(f"程序会提前 {kswt} 秒准备")
    
    if len(sys.argv) > 1:
        h = int(sys.argv[1])
        print_info(f"手动指定小时参数: {h}")
    else:
        h = None
        
    asyncio.run(main())

# ==========================================
# 📊 数据统计和清理
# ==========================================

print_section("数据统计和清理")

current_month = get_network_time().strftime("%Y%m")
try:
    with open('电信金豆换话费.log', 'r') as fr:
        dhjl = json.load(fr)
except FileNotFoundError:
    dhjl = {}

# 重新组织数据格式
dhjl2 = {}
if current_month in dhjl:
    records = dhjl[current_month]
    for fee, phones in records.items():
        if isinstance(phones, list):
            phone_list = phones
        else:
            phone_list = phones.strip('#').split('#')
        for phone in phone_list:
            if phone not in dhjl2:
                dhjl2[phone] = {}
            if current_month not in dhjl2[phone]:
                dhjl2[phone][current_month] = []
            dhjl2[phone][current_month].append(fee)

# 保存统计结果
with open('电信金豆换话费2.log', 'w') as fw:
    json.dump(dhjl2, fw, ensure_ascii=False, indent=4)
    print_success("统计数据已保存")

# 推送时间判断
current_time = get_network_time()
start_time_1 = current_time.replace(hour=10, minute=0, second=30)
end_time_1 = current_time.replace(hour=10, minute=10, second=0)
start_time_2 = current_time.replace(hour=14, minute=0, second=30)
end_time_2 = current_time.replace(hour=14, minute=10, second=0)

if (start_time_1 <= current_time < end_time_1) or (start_time_2 <= current_time < end_time_2):
    print_success("任务执行完成，准备推送结果")
else:
    print_info("当前不在推送时间段")

print_section("脚本执行完成")
print_success("所有任务处理完毕！")