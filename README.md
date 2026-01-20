# 📱 XHS Image MCP

将文章/文本转换为小红书风格图片卡片的 MCP Server。

> 🎨 支持 AI 生成封面图（通过 Gemini）

## ✨ 功能特点

- **智能分页** - 自动将长文本分割成多页，保持阅读连贯性
- **4种精美主题** - minimal / elegant / warm / dark
- **3种小红书比例** - 3:4 (推荐) / 1:1 / 4:3
- **AI 封面生成** - 使用 Gemini 根据文章内容生成艺术封面
- **Markdown 支持** - 直接读取 .md 文件并自动清理格式
- **MCP 协议** - 可与 Claude Desktop / Claude Code 等 AI 工具集成

## 📐 小红书尺寸规范

| 比例 | 尺寸 | 说明 |
|------|------|------|
| **3:4** | 1080×1440px | ⭐ 推荐，占据最大屏幕空间 |
| 1:1 | 1080×1080px | 方形，适合产品展示 |
| 4:3 | 1080×810px | 横版，适合风景照 |

## 🚀 安装

```bash
git clone https://github.com/YOUR_USERNAME/xhs-image-mcp.git
cd xhs-image-mcp
npm install
npx playwright install chromium
```

### 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填入你的 Gemini API Key（可选，用于 AI 封面生成）
```

### 编译

```bash
npm run build
```

## 🔧 使用方法

### 作为 MCP Server（推荐）

添加到 Claude Desktop 配置:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "xhs-image": {
      "command": "node",
      "args": ["/path/to/xhs-image-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

或 Claude Code 配置 (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "xhs-image": {
      "command": "node",
      "args": ["/path/to/xhs-image-mcp/dist/index.js"]
    }
  }
}
```

### 直接测试

```bash
npm test
```

会在 `test-output/` 目录生成测试图片。

## 🛠 MCP Tools

### `text_to_images`

将文本转换为图片序列。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | ✅ | 文本内容 |
| `title` | string | | 标题（用于封面） |
| `theme` | string | | `minimal` / `elegant` / `warm` / `dark` |
| `ratio` | string | | `3:4` / `1:1` / `4:3` |
| `fontSize` | string | | `small` / `medium` / `large` |
| `showCover` | boolean | | 是否生成封面页 |
| `generateAiCover` | boolean | | 是否使用 AI 生成封面图 |
| `charsPerPage` | number | | 自定义每页字数 |
| `outputDir` | string | | 指定输出目录，图片将保存为 PNG 文件 |

### `file_to_images`

将本地 Markdown/文本文件转换为图片。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | ✅ | 文件绝对路径 (.md/.txt) |
| `title` | string | | 覆盖自动提取的标题 |
| `theme` | string | | 主题 |
| `generateAiCover` | boolean | | AI 封面 |
| `outputDir` | string | | 指定输出目录 |

### `estimate_pages`

估算页数（不生成图片）。

### `list_themes`

列出所有可用主题及其描述。

## 🎨 主题预览

| 主题 | 风格 | 适用场景 |
|------|------|----------|
| `minimal` | 白底黑字，简约干净 | 知识干货、教程 |
| `elegant` | 米白衬线，书卷气息 | 小说、散文、诗歌 |
| `warm` | 暖色渐变，卡片风格 | 情感生活、个人分享 |
| `dark` | 深色护眼模式 | 夜间阅读、科技内容 |

## 📁 项目结构

```
xhs-image-mcp/
├── src/
│   ├── index.ts        # MCP Server 主入口
│   ├── paginator.ts    # 文本分页逻辑
│   ├── renderer.ts     # Playwright 图片渲染
│   ├── gemini-image.ts # AI 封面生成
│   └── themes/         # CSS 主题文件
├── articles/           # 文章存放目录
├── .env.example        # 环境变量模板
└── package.json
```

## 🔑 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `GEMINI_API_KEY` | Google Gemini API Key，用于 AI 封面生成 | 可选 |

获取 API Key: https://aistudio.google.com/app/apikey

## 📝 License

MIT
