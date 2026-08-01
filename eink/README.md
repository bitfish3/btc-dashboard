# 土豆片 e-ink 出图模板

把 fuckbtc / 任意 Agent 数据渲染成 **6 色电子墨水屏**能吃的图，走 iOS 快捷指令推到土豆片。

## 管线全景

```
[1 出图引擎]        [2 发布]           [3 快捷指令]        [4 他的 App]
render_potato.py → 公网 PNG URL   →  Shortcut 拉图    →  土豆片 Set Image
(本地/launchd)     (CF/git-served)    (定时/NFC/手动)     (App 走 BLE 推屏)
   ✅ 已建            ⏳ 待接            ⏳ 桩              🔒 待发货
```

**只有 [1] 是难的、也是核心，已完成。** [2][3] 是接线，[4] 要等设备发货拿到 App 的 Shortcut 动作签名。

## [1] 出图引擎 ✅

```bash
python3 render_potato.py                 # → ~/Downloads/potato_pendulum.png
python3 render_potato.py --w 600 --h 448 # 换分辨率(设备真实 px 待坐实)
python3 render_potato.py --no-quantize   # 平滑预览(不做6色量化)
```

- 纯 PIL，无浏览器，确定性，可 launchd。
- 拉实时链上值算**周期钟摆**(与 `../index.html` 的 `computeCyclePendulum` 同模型)，任一源失败回退基线，永远能出图。
- 输出严格量化到 **Spectra 6 调色板**(K/纸白/R/Y/B/G)，dither=NONE 保文字锐利(本卡无照片不需抖动)。所见≈上屏所得。
- **换内容**：只改 `build_frame()`。要接 H 健康看板 / invest / 天气 → 复制此函数换布局与数据源即可。

### 分辨率 TODO
`W_DEFAULT/H_DEFAULT` 是竖版占位。设备发货后按真实面板 px 改这两个常量(Spectra 6 常见：4.01"=640×400 / 5.65"=600×448 / 7.3"=800×480 / 13.3"=1200×1600)。

## [2] 发布：给 Shortcut 一个公网 URL ⏳

Shortcut 要能 `Get Contents of URL` 拉到图，所以 PNG 需公网可达。三选一：

- **A(默认)**：把 PNG 落到 `eink/` 并 `git push` → CF Pages 自动服务于 `https://fuckbtc.com/eink/potato_pendulum.png`。
  *当前 Avibe 本地 git 运行时禁用了 push*，需你在普通终端 push，或解禁后再走。
- **B**：`wrangler r2/pages` 直传(用你的 CF 凭证 `source ~/.env`)——绕开 push，但属发布操作，要你点头。
- **C**：launchd 本地渲染 + `scp` 到 MS-01 已有公网端点。

## [3] 快捷指令模板 ⏳（2 分钟手搓）

新建"快捷指令" → 个人自动化：

1. **触发**：每天 08:00 / 或贴一张 NFC 贴触发 / 或手动。
2. `获取 URL 内容` → 上面 [2] 的 PNG 地址。
3. **(设备到货后)** `土豆片：设置图像`(他的 App 暴露的动作) ← 传入上一步图像。
4. **现在先测**：把第 3 步换成`存储到相册`或`设为壁纸`，验证拉图链路通。

> 出图也可放服务器端 launchd 定时刷新，Shortcut 只管拉最新一张。

## [4] 他的 App 动作 🔒

待土豆片发货 → 装 App → 看它给快捷指令暴露了什么动作、吃什么输入(图片/URL/文字) → 把 [3] 第 3 步接上。若 App 不暴露 Shortcut 图像动作，退回"评估逆向"那套(BLE 抓包)。

## 定时刷新（可选 launchd）
`render_potato.py` 无副作用、幂等，适合挂 launchd 每小时/每晨刷新一张，配合 [2] 自动发布。plist 模板见 `com.potato.eink.plist.sample`(待建)。

## ZECTRIX NOTE4（400×300 黑白屏）

NOTE4 不是土豆片：它是 400×300 的黑白 E-ink，图片通过极趣云 Open API 推送，设备在下一次同步时抓取。page 1 保留周期钟摆，只留下 BTC 价格和 AHR999 两个读数：

```text
render_note4.py  →  400×300 黑白 PNG  →  push_note4.py  →  ZECTRIX page 1
 (钟摆 + 两个读数)                      (X-API-Key + dither=false) (设备同步后显示)
```

### 凭证与首次验证

1. 在 `https://cloud.zectrix.com` 的“开放 API”创建 API Key；API Key 只放 Avibe Vault，名称固定为 `ZECTRIX_API_KEY`，不要写进脚本、plist 或仓库。
2. 从设备列表取得 NOTE4 的 `deviceId`（MAC 地址）。可放在启动项的 `ZECTRIX_DEVICE_ID` 环境变量中；它不是密钥，但不要把它硬编码进公开仓库。
3. 先只渲染检查版式（原生 1-bit 黑白，不制造网点）：

   ```bash
   python3 eink/push_note4.py --dry-run --out /tmp/fuckbtc-note4.png
   ```

4. 有凭证后做一次真实推送（Vault 只向子进程注入密钥）：

   ```bash
   vibe vault run --env ZECTRIX_API_KEY -- \
     python3 eink/push_note4.py --device-id "$ZECTRIX_DEVICE_ID"
   ```

   推送成功后，设备需等同步周期到达，或按语音/确认键触发同步；测试时可暂时把同步周期调成 1 分钟，确认后恢复到 60 分钟以上以保续航。

### 周期调度

`com.fuckbtc.note4.plist.sample` 是每日 08:00 的 LaunchAgent 模板，默认只更新 page 1，避免为了 BTC 价格变化让墨水屏高频唤醒。拿到 API Key 和 `deviceId` 后再复制为 `~/Library/LaunchAgents/com.fuckbtc.note4.plist` 并加载；不要直接加载仍含 `REPLACE_WITH_NOTE4_DEVICE_ID` 的样例。

本管线只负责渲染与推送，不修改现有 `fuckbtc` 网页、VWAP 任务或其他 LaunchAgent。

## page 2：Codex / Claude Code Agent HUD

NOTE4 的第二页现在是独立的 Agent HUD，不会覆盖 page 1 的 BTC + AHR999：

```text
Codex rollout JSONL ─┐
                     ├→ render_agent_hud.py → 400×300 黑白 PNG → page 2
Claude statusLine ──┘
```

页面只出四类信息：模型、Token、Context、额度/重置时间。它不会把 prompt、工具参数、项目路径或凭证写进图片。Codex 目前原生提供周额度和 token；Claude Code 通过本机 `settings.json` 的 status-line adapter 写入 `~/.cache/fuckbtc/claude-usage.json`，下一次 Claude Code 刷新后即可显示原生 context/5h/7d 额度。数据暂缺时显示 `—`，不做伪估算。

只渲染不推送：

```bash
python3 eink/push_note4.py --page-id 2 --dry-run --out /tmp/fuckbtc-note4-agent-hud.png
```

page 2 真实推送（Vault 注入 key，不把 key 放入命令历史）：

```bash
vibe vault run --env ZECTRIX_API_KEY -- \
  python3 eink/push_agent_hud.py
```

`push_agent_hud.py` 按内容签名去重；数字没变就不重复刷新墨水屏。需要持续轮询时，用 Harness 的 `vibe watch` re-arm 一个 60 秒 cycle，不要安装上游 `install.sh`：上游桥接器是 Claude-only、默认 `dither=true`，会把 NOTE4 又变回点阵。

本机已启用的 watcher 等价于：

```bash
vibe watch add --name 'fuckbtc-note4-agent-hud' --forever \
  --timeout 120 --lifetime-timeout 0 --retry-exit-code 75 --retry-delay 60 \
  --cwd /Users/mac26ai/Workspace/10_Code/P/btc-dashboard \
  -- /Users/mac26ai/.local/bin/vibe vault run --env ZECTRIX_API_KEY -- \
  /opt/homebrew/bin/python3 /Users/mac26ai/Workspace/10_Code/P/btc-dashboard/eink/push_agent_hud.py --watch-cycle
```
