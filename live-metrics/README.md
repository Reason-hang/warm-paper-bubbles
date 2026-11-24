# live-metrics

在 Claude Code 桌面端的输入框上方加一行**实时会话指标**，点右侧的箭头展开明细卡。

## 显示什么

常态一行，紧凑、弱化：

```
304 tok/s · TTFT 6.0s · Ctx 23k/256k (9%) · Out 776   ▸
```

| 字段 | 含义 | 来源 |
|---|---|---|
| `tok/s` | 生成速度 | 本步 `output_tokens ÷ 首字到末字耗时` |
| `TTFT` | 首字延迟 | 请求发起到第一个 chunk 到手 |
| `Ctx 23k/256k (9%)` | 上下文占用与窗口 | `$.session.usage()` 与 `session.measure` 推送 |
| `Out 776` | 本轮输出 token | `turn.complete.usage` |

点 `▸` 展开明细：

- 响应耗时、本步输出量
- 输入 新增 + 缓存读取、缓存命中率
- 上下文 / 窗口、距压缩阈值还剩多少

## 为什么用 mod 而不是改客户端

Antigravity 那类补丁靠 CDP 注入 DOM、改启动参数或反解 SQLite，客户端一升级就失效。这里全部来自 Claude Code 官方事件：`turn.step` 是流式钩子，每个 chunk 都能拿到，所以 TTFT 与实时速度精确到毫秒；上下文水位由 `session.measure` 主动推送，不需要轮询。

## 设计取舍

- **不轮询**：上下文水位只在 `session.start` 读一次、之后跟随 `session.measure` 推送。
- **不干扰**：没有任何指标时这一行完全不渲染；调查问卷占位时让开。
- **只算主循环**：`agentId` 存在时（子智能体）不计入，避免数字被并行任务搅乱。
- **估算标注**：不显示金额。`$.session.usage().cost` 是客户端估算，不是账单，这里索性不做。

## 已知边界

- `turn.step` 的流式钩子在 `claude plugin test` 沙箱里无法触发，所以 TTFT 与实时速度只能在真实客户端验证；测试覆盖的是上下文水位、结算值、明细卡与让位。
- 只在桌面端与手机 App 绘制，终端不画。
- 数字是估算：实际计费以服务端为准。
