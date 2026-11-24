# warm-paper-bubbles

把 Claude Code 桌面端里**你发出的消息气泡**换成暖纸米白配色，并在输入框正上方加一条**提问导航**：翻看本会话问过什么，点一条复制全文。

## 安装

```
/plugin install warm-paper-bubbles --marketplace Reason-hang/warm-paper-bubbles
```

在桌面 App 里没有 `/plugin` 时：点输入框左边的 `+` → Plugins → Add marketplace，填 `Reason-hang/warm-paper-bubbles` → Add plugin。

## 它做什么

**1. 气泡换色**：`session.start` 时用 `$.theme.set({ style: { UserMessage } })` 给用户消息套上浅米底（`#f7f2e7`）、深棕字（`#3a3229`）、8pt 圆角与 12/6 内边距。只改气泡本身，选中、复制、查找、Markdown、读屏全部照常。

**2. 提问导航**：输入框上方一行 `3/12  ‹  ›  ⌄  当前这条提问的摘要`。

- `‹` / `›` 在提问之间移动，当前那条的摘要直接显示在行内
- `⌄` 展开最近 6 条，点任意一条把它复制到剪贴板
- 输入 `/my-questions` 也能展开/收起
- `j` / `k` 热键等同 `›` / `‹`

## 为什么用 mod 而不是改客户端

Antigravity 那类补丁靠 CDP 注入 DOM 或改启动参数，客户端一升级就失效。这里用的是 Claude Code 官方插件接口：`AbovePrompt` 渲染位、`$.theme.set` 的气泡样式、`$.ui.copy` 的复制能力，都由引擎提供，不碰客户端二进制。

## 设计取舍

- **只用固定色，不动全局主题**：`style.UserMessage` 只给气泡上色，`colors` 一个字段都不传。
- **对比度**：米底深棕字约 10:1，远高于主题系统 3:1 的硬门槛，不会被引擎退回原色。
- **不挂 `session.append`**：内建 `cc-plugin-sec-default` 在 prepend 层用 `next.to` 越过该事件，user 层钩子收不到。改读 transcript（会话启动、每轮结束、执行命令前各一次）。
- **不用 Pane**：桌面端 Pane 的呈现不受控（实测点了「已打开」却看不到内容）。输入框上方那一行是每个会话都必然渲染的位置。

## 已知边界

- **不能跳到某条消息**。桌面端 transcript 不接受程序化滚动（引擎答 `transcript not scrollable here`），`UiScrollComponent` 也只有 `Pane` 与 `AbovePrompt` 两种站点。左侧竖排缩略导航是 Codex 自己的原生功能，插件做不出来。所以这里的交互是「复制」而非「跳转」。
- 气泡与导航只在桌面端与手机 App 生效，终端里不画。
- 复制走 `$.ui.copy`，需要真实 surface 才落到系统剪贴板；测试里验证的是复制请求的内容正确。
