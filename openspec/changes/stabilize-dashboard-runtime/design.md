## Context

基线为 `d7c93e5`。前端约 85 KB，无生产依赖；Cloudflare Pages 直接发布仓库静态文件，Worker 独立发布。原工作区 Worker WIP 与线上第三种版本不一致，不能把重构分支当作 Worker 发布来源。QA 原始证据见本次 QA 报告；代码审查是独立的 OpenSpec 设计输入。

## Goals / Non-Goals

**Goals:** 有限等待、故障隔离、低频数据低频请求、可信缓存、快速恢复、可测试的模块边界。

**Non-Goals:** 新增后端/数据库、合并 Worker WIP、变更投资模型阈值、修改 e-ink/告警/周更调度、自动发布。

## Decisions

1. **原生 ES modules、继续静态部署。** `assets/runtime.mjs` 负责网络/缓存/调度，`assets/data-sources.mjs` 负责端点解析及校验，`assets/dashboard.mjs` 负责呈现和依赖重算。`index.html` 保留 HTML/CSS 和两个周更常量，以 `globalThis.BTC_WEEKLY` 交给控制器。对比新增框架/构建器，这个边界直接解决现有耦合，避免引入构建与升级故障点。

   ```text
   Cloudflare Pages
      index.html（布局 / 周更常量）
           |
      dashboard.mjs（卡片状态 / 派生指标 / 交互）
           |
      data-sources.mjs（语义校验 / 多源适配）
           |
      runtime.mjs（超时 / 竞速 / 缓存 / 调度）
           +-- 内存 <--> localStorage（可失效，不是运行必需）
           +-- 现有公开 API / btc-cache Worker
   ```

2. **完整请求超时。** `requestJson(url, {timeoutMs, signal, fetchImpl})` 在 JSON 解码完成前一直保留超时；HTTP 非成功、JSON 无效、超时都拒绝。`raceSources([(signal)=>Promise,...])` 只选通过数据源校验的结果，胜者确定后取消其余请求。价格主源 5 秒预算，后续降级各 5 秒；K 线源每个 8 秒。超时必须终结调用，即使测试替身忽略 abort。

3. **缓存有验证器，内存独立于持久化。** `createStore({storage, now, validators})` 提供 `get(key,maxAgeMs)`、`getRecord(key)`、`set(key,value,{dataAt,source})`、`subscribe(listener)`。兼容原 `btc_*` 的 `{t,v}` 格式。拒绝坏数值、坏结构、未来时间戳；storage 抛错时内存照常更新。`t` 是获取时间，`dataAt` 是上游数据日期；UI 不把获取成功声称为源数据已更新。失败不改 last-good 的时间戳。

4. **数据任务统一注册、单任务仅一个请求批次。** `createScheduler({tasks,now,setTimer,clearTimer,isActive,onStatus})` 提供 `start/stop/refreshDue/run/getState`；task 是 `{key,run,intervalMs,initialDelayMs}`。隐藏/离线时不发新请求，返回前台或在线时仅启动到期任务；失败退避，从 5 秒开始，最多 2 分钟且不超过原周期。价格 15 秒，算力 5 分钟，日/周 K 线 5 分钟，F&G/减半 10 分钟，MVRV-Z/STRC/概率 30 分钟，其余链上/mNAV 1 小时。所有链上指标都有周期任务；首轮可用任务最迟 500ms 启动，取消固定 2s/4s/5.5s 依赖等待。

5. **每个数据源独立成功、独立降级。** STRC 飞轮与发行量是两个任务/缓存，快源先呈现；无数据不写 null 覆盖好缓存。价格更新主动重算 ahr999、200WMA/BP 比率、VWAP 倍数、mNAV 与钟摆，mNAV API 与 BTC 报价并发获取。矿机更新在一帧内合并，慢算力不会阻塞价格/锚点呈现。

6. **未知数据不合成确定结论。** PSIP 当前没有经过确认的百分比字段，页面显示暂无可靠数据，并从钟摆排除。MSTR 不能用 65000 默认价兜底；缺少价格或公司参数时显示不可用。钟摆只有有效指标权重覆盖至少 60% 且至少三项时才显示综合判断，否则展示覆盖信息与数据不足。模型阈值沿用基线，覆盖阈值是质量门槛，不是投资模型校准。

7. **可验证目标。** Mock 浏览器环境下，缓存卡片首轮渲染不等待网络；价格 50ms、算力挂起时，价格应在 1s 内可见；快 STRC 在慢发行源未结束前出现；滑块变化 100ms 内更新；任意单源失败不能抛出未处理错误或覆盖好缓存。实际线上耗时受外部 API、网络与 Cloudflare POP 影响，报告只对实测样本负责。

## Risks / Trade-offs

- [第三方接口仍可能不可达] → 有界超时、缓存与明确状态；冷启动完全无可用源时只能诚实显示不可用，前端不能制造数据。
- [拆模块新增少量静态请求] → 体积依然小、同源模块可缓存；保留 Pages 默认 ETag 重验证，避免无内容 hash 文件设置 immutable。相关规则已核对 [Cloudflare Pages serving](https://developers.cloudflare.com/pages/configuration/serving-pages/)。
- [旧缓存或上游字段语义不明] → 严格校验，PSIP 不猜换算；以数据少于原页面换取正确性。
- [后台标签切换造成突发请求] → 只启动到期任务，并保持单任务排重；每任务预算有限。
- [现有 Worker 漂移未解决] → 本次不部署 Worker，交接中保留三个版本的界限；下一次 Worker 改造先确认 WIP 与字段契约。
- [长期开网页时价格依赖 stale] → 过期/不可用状态可见，派生指标不使用超过有效期的输入。

## Migration Plan

原目录已做 tar 备份并记录三个未提交文件的 SHA256；新分支位于隔离 worktree。完成单元/集成/浏览器 QA、OpenSpec 验证后本地提交。用户确认后才能将已验证提交合入发布分支并 push；Pages 自动发布，Worker 无动作。生产失败则通过 Pages 回滚至前一部署，随后修复发布分支；不运行任何会自动 push 的周更脚本。没有持久服务迁移或数据迁移，因此不涉及重启已有基础设施。

## Open Questions

Worker WIP 的完成度、线上 PSIP 字段语义及上游数据实际日期不在当前已确认事实内。本次通过隔离及不可用状态规避，不将它们作为实施前置条件。
