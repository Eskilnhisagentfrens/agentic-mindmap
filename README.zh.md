# Agentic Mindmap

[English](./README.md) · **中文** · [日本語](./README.ja.md)

可与 LLM agent 协同的本地思维导图应用，XMind 风格。支持桌面（macOS Electron）和浏览器两种运行方式，**数据完全保存在本地**。

> 🤖 **AI 扩展**：选中任意节点，点击工具栏 🤖 按钮，DeepSeek-reasoner 为它生成 3-5 个合理的子节点（子任务、子主题、关键点）。子节点会自动匹配父节点语言，并避开已有子节点。

## 运行

### macOS 桌面版（推荐）

```bash
git clone https://github.com/Eskilnhisagentfrens/agentic-mindmap.git
cd agentic-mindmap
npm install      # 首次运行
npm start        # 启动
```

打包成 `.dmg`：

```bash
npm run dist     # 产物在 dist/
```

### 浏览器版

直接双击 `index.html`，或：

```bash
open index.html
```

手机上查看：把 `index.html` 通过 AirDrop / iCloud Drive 发到 iPhone，用 Safari 打开。已适配 iPhone 17 Pro 灵动岛和刘海。

## 配置 AI 扩展

🤖 按钮需要 API key——可选 DeepSeek（推荐，比 Anthropic 便宜约 30 倍）或 Anthropic。

**方式 A：macOS Keychain（推荐，不进 shell history）**

```bash
security add-generic-password -a "$USER" -s "DEEPSEEK_API_KEY" -w 'sk-...'
```

**方式 B：环境变量（写到 `~/.zshrc`）**

```bash
export DEEPSEEK_API_KEY="$(security find-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w)"
# 或者用 Anthropic：
export ANTHROPIC_API_KEY=sk-ant-...
```

应用在 Electron 主进程里**懒加载** key，不会进 `localStorage`、渲染进程内存或 shell history。完整安全模型见 [docs/architecture.md](./docs/architecture.md)。

## 基本操作

### 键盘（桌面）

| 操作 | 快捷键 |
| --- | --- |
| 添加子节点 | `Tab` |
| 添加同级节点 | `Enter` |
| 编辑选中节点 | `F2` 或双击 |
| 删除节点 | `Delete` / `Backspace` |
| 方向键导航 | `← ↑ → ↓` |
| 折叠 / 展开 | `Space` 或点击节点右侧圆点 |
| 撤销 / 重做 | `⌘Z` / `⇧⌘Z` |
| 搜索 | `⌘F`，`Enter` / `⇧Enter` 切换匹配 |
| 适配视图 | `⌘0` |
| 放大 / 缩小视图 | `⌘=` / `⌘-` 或滚轮 |
| 放大 / 缩小节点（全局） | `⌘⇧=` / `⌘⇧-` |
| 新建 | `⌘N` |
| 打开 | `⌘O` |
| 保存 JSON | `⌘S` |
| 导出 Markdown | `⌘⇧E` |
| 大纲视图 | `⌘⇧O` |
| 全屏 | `⌃⌘F` |
| 开发者工具 | `⌥⌘I` |

### 鼠标 / 触摸

- **拖拽节点**：
  - 落在别的节点中部 → 成为其子节点
  - 落在上 / 下边缘 → 作为前 / 后兄弟
  - 落在空白处 → 自由定位（节点带绿色虚线框，整棵子树跟随）
  - 拖拽过程中按 `Esc` 取消
- **调整节点大小**（选中节点后出现手柄）：
  - 右下角圆点 → 自由改宽高
  - 右边竖条 → 只改宽度（文字自动换行）
  - 下边横条 → 只改高度
  - `Shift` + 拖右下角 → 等比缩放
- **画布**：
  - 滚轮 / 触控板双指 → 平移
  - `⌘` + 滚轮 / 双指捏合 → 缩放
  - 空白处按住拖动 → 平移画布

### iPhone

- 点击选中，双击 / 长按编辑
- 底部工具栏：添加子节点、同级、图标、颜色、备注、删除
- 双指捏合缩放，单指平移
- 其他功能通过顶部工具栏

## 进阶功能

### 颜色与图标

工具栏 🎨 给节点上色，12 色调色板。**子节点默认继承最近祖先的颜色**，连线颜色跟随分支。要让子节点用不同颜色，单独给它设色即可覆盖。

工具栏 😀 加图标，24 个常用 emoji。

### 备注

工具栏 📝 打开右下角备注面板，支持多行。有备注的节点右上角会显示蓝色小圆点。

### 关系线 🔗

跨节点连接（不走父子关系）。

1. 选中起点节点 → 点 🔗
2. 点击目标节点建立关系
3. 双击关系线或标签 → 修改文字
4. 单击选中，`Delete` 删除
5. `Esc` 取消建立流程

### 概要 📎

给一组同级节点加大括号和总结文字。

1. 选中一个节点 → 点 📎，为该节点父节点新建概要
2. `Shift` + 点击同级兄弟 → 扩展覆盖范围
3. 双击标签改文字
4. 选中后 `Delete` 删除

### 外框 ⬚

给某个分支加虚线彩色边框分组。选中节点 → 点 ⬚ 切换。颜色默认跟随节点颜色。

### 大纲视图 📋

左侧侧栏显示完整树结构，支持：
- 点击行跳转到画布对应节点并居中
- 双击行修改文字
- 小三角折叠 / 展开

和画布双向同步。

### 布局

工具栏 🗺️ / 🌳 切换：
- **中心放射**（默认）：根节点居中，子节点左右分布
- **右侧树**：根节点在左，整棵树向右延伸

### 搜索

`⌘F` 打开搜索框，实时匹配节点文字和备注。匹配项高亮发光，非匹配项淡出。`Enter` / `⇧Enter` 循环切换，`Esc` 关闭。跳转时自动展开折叠的祖先并平移到可见区域。

## 文件格式

### JSON（无损）

默认源格式，保留所有数据：结构、图标、颜色、备注、尺寸、位置偏移、关系线、概要、外框。

`⌘S` 或工具栏 💾 保存。

### Markdown（通用）

用嵌套列表表达层级，兼容 Obsidian / Typora / GitHub。保留文字、图标、颜色、备注；**关系线 / 概要 / 外框 / 尺寸信息不导出**（保持格式通用）。

```markdown
# 🎯 中心主题 <!-- c:#89b4fa -->

- 💡 分支一 <!-- c:#f9e2af -->
  > 这里是备注
  - 想法 A
  - 想法 B
- ⭐ 分支二
```

规则：
- `#` 开头 → 根节点
- 缩进两格的 `-` / `*` / `+` → 子节点
- 行首 emoji → 节点图标
- 行末 HTML 注释 `<!-- c:#hex -->` → 节点颜色
- `> ` 开头 → 节点备注

`⌘⇧E` 或工具栏 📤 导出。

### 导出图片

- 🖼️ **SVG**：矢量图，可任意放大，可再编辑
- 📷 **PNG**：2× Retina 分辨率

两者都包含节点、连线、颜色、外框、关系线、概要。

## 自动保存

浏览器版：每次改动自动写入 `localStorage`，刷新不丢。

桌面版：同上，数据存在 `~/Library/Application Support/Agentic Mindmap/Local Storage/`。想显式落盘到文件，`⌘S` 导出 JSON。

## 项目结构

```
agentic-mindmap/
├── index.html         # 单文件 Web 应用（~2600 行，含所有渲染逻辑）
├── main.js            # Electron 主进程：原生菜单、文件对话框、AI IPC
├── preload.js         # IPC 桥接
├── docs/
│   └── architecture.md  # AI 扩展架构 + 路线图
├── package.json
└── dist/              # npm run dist 的打包产物
```

## 重置 / 清空

- 工具栏 ✨ 新建：清空当前导图（会提示确认）
- 工具栏 ⟲ 重置选中节点的自由位置、尺寸、缩放
- 彻底清空数据：桌面版 `rm -rf "~/Library/Application Support/Agentic Mindmap"`；浏览器版 DevTools → Application → Local Storage 清除

## 路线图

- [x] AI 扩展按钮：对任意节点用 DeepSeek-reasoner 生成子节点
- [ ] **MCP server**：把 mindmap 暴露成 MCP server，Claude Code / Desktop 直接当 tool 调用读写画布（不消耗 API 费用，走 Max OAuth）
- [ ] 应用内 chat 侧边栏，与导图双向同步
- [ ] AI 扩展 token-by-token 流式输出
- [ ] 应用内设置面板：API key、模型选择
- [ ] 每次扩展可选模式：`brainstorm` / `plan` / `summarize`

## 已知限制

- MD 导入时会忽略不认识的语法
- SVG / PNG 导出不包含 Emoji 字体（依赖系统字体渲染）
- 桌面版第一次 `npm run dist` 会下载 ~150MB Electron 打包资源，耗时较久
- `npm run dist` 产物未签名，首次打开需要 `xattr -cr <app>` 或右键 → 打开

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。
