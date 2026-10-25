---
name: create-rn-expogo-dev-qrcode
description: 把 React Native / Expo 的 dev server 地址生成二维码图片并打开，供用户用 Expo Go 真机扫码测试。当项目是 RN/Expo 工程、用户说「我要真机测试」「给我二维码」「扫码看看」「用 Expo Go 测一下」等，需要出二维码时使用。
---

# Expo Go 真机测试二维码

目标是**一条龙**：确认 Metro 在跑 → 拿到手机能访问的地址 → 生成二维码图片并打开 → 把地址和注意事项一并告诉用户。

平台默认 Windows + PowerShell 5.1（不能用 `&&`、三元、`??`）。

## 步骤

### 1. 定位工程目录

找同时包含 `app.json` / `app.config.*` 与 `package.json` 的目录（本项目在 `rnapp/`）。后面所有命令都在这个目录里跑。

### 2. 确认 dev server 在跑

```powershell
try { (Invoke-WebRequest -UseBasicParsing http://localhost:8081/status -TimeoutSec 3).Content } catch { 'not-running' }
```

- 返回 `packager-status:running` → 已就绪，直接用。
- 返回 `not-running` → 在工程目录后台启动：`npx expo start --lan`，然后轮询上面的 `/status` 直到 running（通常 10~30 秒）。**不要**用 `run_in_background` 之外的方式阻塞等待。

### 3. 取手机可达的局域网 IP

```powershell
$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1
$ip = (Get-NetIPAddress -InterfaceIndex $route.ifIndex -AddressFamily IPv4).IPAddress
```

要点：

- 必须用默认路由所在的网卡，别用第一个匹配的 `192.168.x.x`（多网卡、虚拟网卡会取错）。
- 排除 `127.0.0.1`、`169.254.*`（APIPA）。
- 端口默认 8081；如果 Metro 换了端口（启动日志里的 `Waiting on http://localhost:xxxx`），以日志为准。

### 4. 生成二维码并打开

```powershell
$url = "exp://${ip}:8081"
$out = Join-Path $env:TEMP 'expo-qr'
New-Item -ItemType Directory -Force $out | Out-Null
$png = Join-Path $out 'expo-go-qr.png'
npx --yes qrcode $url -o $png -w 720
Invoke-Item $png
```

- 输出放系统临时目录，**不要**把图片写进仓库（避免污染 git 状态）。
- 图片打不开或 `qrcode` 拉不下来时，退化用 `npx --yes qrcode-terminal $url` 在终端打印 ASCII 二维码，同时把 URL 明文给用户。
- 注意 PowerShell 里不要写成 `"$ip:8081"`（冒号会被当成作用域分隔），统一用 `${ip}` 包裹。

### 5. 回复用户

一次性给全：

1. 二维码已打开（给图片路径）。
2. URL 明文 `exp://<ip>:8081` —— 扫码失败时可在 Expo Go 里手动输入。
3. 前置条件：手机与电脑连**同一个 Wi-Fi**；不是访客网络；关掉手机 VPN / 移动数据；Expo Go 版本要支持当前 SDK 版本。

## 扫码后一直转圈时（排查顺序）

先分清是哪一层，再动手：

1. **手机浏览器打开 `http://<ip>:8081`**
   - 打不开 → 网络层：不同 Wi-Fi、路由器 AP 隔离、访客网络、手机 VPN。换网络或改用第 2 条。
   - 能打开 → 服务端通，问题在 Expo Go：杀后台重开、确认 Expo Go 支持该 SDK、重新扫码。
2. **看 Metro 日志有没有 bundle 请求**（`Android Bundled` / `iOS Bundled`）：完全没有 → 手机没取到 bundle，属网络层；有 → App 已经在跑，是 App 自己的加载态/报错。
3. **局域网确实不通时**：`npx expo start --tunnel` 可绕开，但需要全局 `@expo/ngrok`。这是安装全局包，**必须先问用户**再装；另一个选择是 USB：`adb reverse tcp:8081 tcp:8081` 后用 `exp://127.0.0.1:8081`。
4. 如果 Expo Go 里报 `Cannot find native module ...`，那不是网络问题，是 Expo Go 缺原生模块。先修代码里的运行时降级（本项目见 `rnapp/src/notifications/notificationsModule.ts` 的做法），再重新扫码。

## 已知限制（要在合适时机提醒用户）

- Expo Go 内置的第三方原生模块有限，**推送 / 本地提醒不可用**（SDK 53+ 移除了远程推送），要用 `expo-notifications` 的效果必须装 APK。
- Expo Go 的数据与已安装 APK 是两套沙箱：账号数据靠云同步拉回，不能指望本地库互通。
- 二维码只对当前 dev server 有效；Metro 重启后 IP 通常不变，可直接重扫。
