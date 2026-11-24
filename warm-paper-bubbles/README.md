# warm-paper-bubbles

把 Claude Code 桌面端里**你发出的消息气泡**换成暖纸米白配色，并在输入框正上方加一条**提问导航**：上一问 / 下一问 / 全部，点任意一条跳回那条消息。

## 安装

```
/plugin install warm-paper-bubbles --marketplace Reason-hang/warm-paper-bubbles
```

在桌面 App 里没有 `/plugin` 时：点输入框左边的 `+` → Plugins → Add marketplace，填 `Reason-hang/warm-paper-bubbles` → Add plugin。

## 它做什么

**1. 气泡换色**：`session.start` 时用 `$.theme.set({ style: { UserMessage } })` 给用户消息套上浅米底（`#f7f2e7`）、深棕字（`#3a3229`）、12pt 圆角、1pt 暖灰描边与 14/10 内边距。只改气泡本身，选中、复制、查找、Markdown、读屏全部照常。

**2. 提问导航**：输入框上方一行 `▸ 提问 3/12  ‹ 上一问  下一问 ›  全部`。

- `‹ 上一问` / `下一问 ›` 滚到相邻那条你自己发的消息
- `全部` 展开最近 8 条，点任意一条直接跳过去
- 输入 `/my-questions` 也能展开/收起

## 为什么用 mod 而不是改客户端

Antigravity 那类补丁靠 CDP 注入 DOM 或改启动参数，客户端一升级就失效。这里用的是 Claude Code 官方插件接口：`AbovePrompt` 渲染位、`$.theme.set` 的气泡样式、`$.ui.scroll` 的定位能力，都由引擎提供，不碰客户端二进制。

## 设计取舍

- **只用固定色，不动全局主题**：`style.UserMessage` 只给气泡上色，`colors` 一个字段都不传。
- **对比度**：米底深棕字约 10:1，远高于主题系统 3:1 的硬门槛，不会被引擎退回原色。
- **不挂 `session.append`**：内建 `cc-plugin-sec-default` 在 prepend 层用 `next.to` 越过该事件，user 层钩子收不到。改读 transcript（会话启动、每轮结束、执行命令前各一次）。
- **不用 Pane**：桌面端 Pane 的呈现不受控（实测点了「已打开」却看不到内容）。输入框上方那一行是每个会话都必然渲染的位置。

## 已知边界

- 跳转走 `$.ui.scroll({ to: { requestId: <消息 uuid> } })`，要求调用来自你自己的输入（点按钮正是这种情况）。
- 气泡与导航只在桌面端与手机 App 生效，终端里不画。
- `claude plugin test` 的沙箱没有 `ui.scroll` 实现，测试覆盖列表内容、过滤、让位与展开，跳转本身需在真实客户端点一次确认。
