# Agentic Mindmap

[English](./README.md) · **中文** · [日本語](./README.ja.md)

本地思维导图应用，**Claude 能直接读、搜、编辑**——XMind 风格、本地优先，数据不出你的电脑。

**两个旗舰能力：**

- 🤖 **AI 扩展** —— 选中任意节点，点 🤖（快速）或 🧠（深度），模型自动识别节点类型、选最合适的分解方法、按复杂度选 1-3 层深度。每个子节点带一句 why 直接显示在画布上。
- 🔌 **MCP 插件** —— Claude Code / Desktop **既能读也能写**你的脑图，共 8 个工具。读（`mindmap_get_state` / `mindmap_get_subtree` / `mindmap_search`）不依赖 app 是否打开。写（`mindmap_add_node` / `mindmap_update_node` / `mindmap_delete_node` / `mindmap_move_node` / `mindmap_ai_expand`）需要 app 在跑，且会进入用户的 undo 历史（⌘Z 回退任何 Claude 操作）。走 Claude Max OAuth → **每次调用 $0**。

## 安装

### 下载发布版（无需自己编译）

[**最新发布**](https://github.com/Eskilnhisagentfrens/agentic-mindmap/releases/latest) —— 提供 Apple Silicon 和 Intel Mac 两种 DMG。

```bash
# 首次启动需要绕过 Gatekeeper（DMG 未签名）：
xattr -cr "/Applications/Agentic Mindmap.app"
```

### 从源码编译（开发者）

```bash
git clone https://github.com/Eskilnhisagentfrens/agentic-mindmap.git
cd agentic-mindmap
npm install      # 首次运行
npm start        # 启动
npm run dist     # 在 dist/ 生成 .dmg
```

### 浏览器版

直接双击 `index.html`，或：

```bash
open index.html
```

手机查看：把 `index.html` 通过 AirDrop / iCloud Drive 发到 iPhone，用 Safari 打开。已适配 iPhone 17 Pro 灵动岛和刘海。

## 配置 AI 扩展

🤖 按钮需要 API key——可选 DeepSeek（推荐，比 Anthropic 便宜约 30 倍）或 Anthropic。

**推荐：macOS Keychain（不进 shell history）**

```bash
security add-generic-password -a "$USER" -s "DEEPSEEK_API_KEY" -w 'sk-...'
```

DeepSeek 注册：https://platform.deepseek.com（国际版）。Anthropic 注册：https://console.anthropic.com。

**备选：环境变量**（写到 `~/.zshrc`）：

```bash
export DEEPSEEK_API_KEY="$(security find-generic-password -a "$USER" -s DEEPSEEK_API_KEY -w)"
# 或：
export ANTHROPIC_API_KEY=sk-ant-...
```

应用在 Electron 主进程里**懒加载** key，不会进 `localStorage`、渲染进程内存或 shell history。完整安全模型见 [docs/architecture.md](./docs/architecture.md)。

## AI 扩展是怎么工作的

点击节点的 🤖 按钮后：

1. 模型先**识别节点类型**——目标 / 概念 / 问题 / 选项 / 流程 / 制品。
2. 然后**判断复杂度，选择深度（1-3 层）**——原子任务如「重启路由器」停在 1 层；多阶段项目如「搭建 SaaS 产品」会到 3 层、最多 40 节点。**分支衰减**防止节点爆炸（顶层 3-6 个、中层 2-4 个、底层 2-3 个）。
3. 根据节点类型**选择对应的分解方法**——目标用动词开头的任务、主题用子概念、选项用比较维度等。
4. **同级感知**：模型会看到当前节点的同辈节点风格，新生成的子节点会保持一致的粒度和语气。
5. 每个子节点带一句**多句 why**说明角色，前 ~3 行直接显示在画布上（节点标题下方，蓝点提示）。点 📝 看完整文字。
6. Prompt 明确要求**具名实体**（真实公司/法规/产品）、**关键数字**（价格/期限/市场规模）、**明确推荐**——通用类目（如「市场分析」）被显式列为失败模式。

进度浮层带脉冲 🤖 + 实时秒数 + 4 阶段状态文字 + 渐近进度条（永远不到 100%，直到结果真返回，避免"卡在 99%"）。

## 基本操作

### 键盘（桌面）

| 操作 | 快捷键 |
| --- | --- |
| 添加子节点 | `Tab` |
| 添加同级节点 | `Enter` |
| 编辑选中节点 | `F2` 或双击 |
| **编辑模式下全选文字** | `⌘A`（或先进编辑模式再全选） |
| **复制节点子树为 Markdown** | `⌘C` |
| **粘贴 Markdown 大纲为子节点** | `⌘V` |
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
| **导出 PDF** | `⌘P` |
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

工具栏 🎨 给节点上色（12 色）。**子节点默认继承最近祖先的颜色**，连线颜色跟随分支。要让子节点用不同颜色，单独给它设色即可覆盖。

工具栏 😀 加图标（24 个常用 emoji）。

### 备注 + 画布内联预览

工具栏 📝 打开右下角备注面板（多行）。有备注的节点右上角显示蓝色小圆点。**AI 生成的子节点自动用模型的"why"填充备注——直接显示在画布上，无需打开面板**。

### 关系线 🔗 / 概要 📎 / 外框 ⬚ / 大纲 📋 / 搜索

同前——详细操作见应用内 Help（⌘?）。

### 布局

工具栏 🗺️ / 🌳 切换：**中心放射**（默认）/ **右侧树**。

## 文件格式

### JSON（无损）

默认源格式。保留所有数据：结构、图标、颜色、备注、尺寸、位置偏移、关系线、概要、外框。

`⌘S` 或工具栏 💾 保存。

### Markdown（通用）

用嵌套列表表达层级，兼容 Obsidian / Typora / GitHub。保留文字、图标、颜色、备注。

```markdown
# 🎯 中心主题 <!-- c:#89b4fa -->

- 💡 分支一 <!-- c:#f9e2af -->
  > 这里是备注
  - 想法 A
- ⭐ 分支二
```

`⌘⇧E` 或工具栏 📤 导出。

### OPML（XMind / MindNode / Logseq 兼容）

标准 OPML 2.0。可在 **XMind**、**MindNode**、**Logseq**、**iThoughts**、**Workflowy**、**OmniOutliner** 中导入并继续编辑。

工具栏 🌳 导出。

### PDF（矢量）

通过 Electron 的 `printToPDF` 生成原生矢量 PDF（A3 横向）。可任意放大不模糊。

`⌘P` 或工具栏 📄 导出。浏览器版自动 fallback 到打印对话框（用「保存为 PDF」）。

### 导出图片

- 🖼️ **SVG**：矢量图，可任意放大，可再编辑
- 📷 **PNG**：2× Retina 分辨率

两者都包含节点、连线、颜色、外框、关系线、概要。

## 报告问题

应用内：**Help → 报 Bug** 自动打开 GitHub Issues 创建页面，已预填版本、OS、Electron 版本、本地日志文件路径。**Help → 打开日志文件夹** 直接打开 `~/Library/Logs/Agentic Mindmap/`。

日志包含每次 AI 调用（时间戳、耗时、识别类型、深度）和所有错误（含 stack trace）。

## 自动保存

浏览器版：每次改动自动写入 `localStorage`，刷新不丢。

桌面版：同样，存在 `~/Library/Application Support/Agentic Mindmap/Local Storage/`。要显式落盘到文件，`⌘S` 导出 JSON。

## 项目结构

```
agentic-mindmap/
├── index.html           # 单文件 Web 应用（~2700 行，含所有渲染逻辑）
├── main.js              # Electron 主进程：原生菜单、文件对话框、AI IPC、日志
├── preload.js           # IPC 桥接
├── docs/
│   └── architecture.md  # AI 扩展架构 + MCP 路线图
├── package.json
└── dist/                # npm run dist 的打包产物
```

## 重置 / 清空

- 工具栏 ✨ 新建：清空当前导图（会提示确认）
- 工具栏 ⟲：重置选中节点的自由位置 / 尺寸 / 缩放
- 彻底清空：桌面版 `rm -rf "~/Library/Application Support/Agentic Mindmap"`；浏览器版 DevTools → Application → Local Storage 清除

## 路线图

### v0.4.0 已完成
- [x] **MCP write tools** —— `mindmap_add_node` / `mindmap_update_node` / `mindmap_delete_node` / `mindmap_move_node` / `mindmap_ai_expand`，Claude **真能编辑你的脑图**。改动通过 localhost HTTP（per-launch token + 0600 control file）下发，走用户正常的撤销历史，⌘Z 回退任何 Claude 操作。

### v0.3.x 已完成
- [x] **MCP read tools** —— `mindmap_get_state` / `mindmap_get_subtree` / `mindmap_search`（app 不开也能读）
- [x] **流式 AI 扩展** —— token 边出边显示在进度卡片下方
- [x] **快速/深度模式** —— 🤖（chat/haiku，~5-10s）vs 🧠（reasoner/sonnet，~30-90s）
- [x] **干净的默认树** —— 单节点起点，无预置分支
- [x] **DMG 含 MCP 插件文件** —— `mcp/`、`.mcp.json`、`.claude-plugin/`、`skills/` 全在 `Contents/Resources/`

### v0.2.0 已完成
- [x] **AI 扩展** —— 单按钮智能分解（自动识别 + 深度 1-3 + 同级感知 + 每节点 why）
- [x] **PDF / OPML 导出** + 剪贴板（⌘C/⌘V/⌘A）+ 画布内联备注预览 + 日志和友好错误

### 即将推出
- [ ] **MCP Phase 3** —— 服务器主动推送 `notifications/resources/updated`，用户端编辑实时通知 host；`mindmap_ai_expand` 流式
- [ ] 应用内 **设置面板** —— API key、模型选择、质量/速度预设
- [ ] **App 图标 + 代码签名**（去掉 `xattr -cr` 这一步）
- [ ] 应用内 chat 侧边栏，与导图双向同步

## 已知限制

- Markdown 导入会忽略不认识的语法
- SVG / PNG 导出不含 Emoji 字体（依赖系统字体渲染）
- 第一次 `npm run dist` 会下载 ~150MB Electron 资源
- DMG 未签名，首次启动需要 `xattr -cr <app>` 或右键 → 打开

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。
