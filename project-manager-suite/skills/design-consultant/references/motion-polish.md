# 动效与组件手感

本文件吸收 `emil-design-eng` 中适合部门产品的动效和组件手感规则。原则是：动效服务理解、反馈和状态，不服务炫技。

## 是否需要动画

| 使用频率 | 决策 |
|---|---|
| 每天 100 次以上，如快捷键、命令面板 | 不要动画 |
| 每天几十次，如 hover、列表导航 | 极短或不动画 |
| 偶尔使用，如弹窗、抽屉、toast | 标准动画 |
| 低频或首次体验，如引导、成功反馈 | 可以增加轻微愉悦感 |

## 动画必须有目的

有效目的：

- 空间一致性：元素从合理方向进入和退出。
- 状态变化：按钮、tab、保存状态有反馈。
- 解释关系：展示流程、进度、层级。
- 减少突兀：内容出现/消失不生硬。

无效目的：

- “看起来酷”。
- 每个元素都动。
- 用户高频操作仍强制等待动画。

## 时长

| 元素 | 建议时长 |
|---|---:|
| button press | 100-160ms |
| tooltip / small popover | 125-200ms |
| dropdown / select | 150-250ms |
| modal / drawer | 180-300ms |
| 营销解释动画 | 可更长，但要可跳过或不阻塞 |

UI 动效默认不要超过 300ms。

## Easing

推荐 token：

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

规则：

- 进入和响应优先 `ease-out`。
- 屏幕内移动使用 `ease-in-out`。
- 常速运动使用 `linear`。
- 不要在 UI 进入动画中使用 `ease-in`，它会显得迟钝。

## 组件手感

### Button

按钮必须有 active feedback：

```css
.button {
  transition: transform 160ms var(--ease-out);
}

.button:active {
  transform: scale(0.98);
}
```

### Popover

Popover 从触发点出现，不从中心缩放。Modal 是例外，modal 保持居中。

### Tooltip

第一个 tooltip 可以延迟，连续 hover 相邻 tooltip 时应更快或无动画，避免工具栏迟钝。

## 性能规则

- 优先动画 `transform` 和 `opacity`。
- 不动画 `height`、`width`、`padding`、`margin`，除非有充分理由。
- 高频动态交互避免每帧 React state 更新。
- 复杂动效要支持中断。
- 所有非必要移动动效必须支持 `prefers-reduced-motion`。

## Review 检查项

| 问题 | 修正 |
|---|---|
| `transition: all` | 明确列出属性 |
| 从 `scale(0)` 进入 | 从 `scale(0.95)` + opacity 进入 |
| UI 使用 `ease-in` | 改为 `ease-out` 或自定义曲线 |
| popover 从中心缩放 | 使用触发点 transform-origin |
| 高频键盘操作有动画 | 移除 |
| UI 动画超过 300ms | 缩短到 150-250ms |
| hover 未区分触摸设备 | 使用 hover/pointer media query |
| 没有 reduced motion | 增加降级 |

