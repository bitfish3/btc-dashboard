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
