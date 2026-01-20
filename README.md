# XHS Image MCP

将文章/文本转换为小红书风格图片卡片的 MCP Server，支持 AI 生成封面图。

## 功能

- **智能分页** - 使用浏览器实际测量自动分页，确保内容不溢出
- **4种主题** - minimal / elegant / warm / dark
- **3种比例** - 3:4 (推荐) / 1:1 / 4:3
- **AI 封面** - 使用 Gemini 根据文章内容生成艺术封面（设置 API Key 后自动启用）
- **Markdown 支持** - 直接读取 .md 文件并自动清理格式
- **MCP 协议** - 可与 Claude Desktop / Claude Code 集成

## v1.1.0 更新

- ✨ **智能 AI 封面** - 设置 `GEMINI_API_KEY` 后自动生成 AI 封面，无需手动开启
- 🔧 **自动分页优化** - 使用浏览器实际测量替代字数估算，彻底解决内容溢出问题
- 📐 **AI 封面空间适配** - 第一页自动为 AI 封面横幅预留空间

## 小红书尺寸

| 比例 | 尺寸 | 说明 |
|------|------|------|
| **3:4** | 1080×1440px | 推荐，占据最大屏幕空间 |
| 1:1 | 1080×1080px | 方形，适合产品展示 |
| 4:3 | 1080×810px | 横版，适合风景照 |

## 安装

```bash
npm install -g xhs-image-mcp
npx playwright install chromium
```

或从源码安装：

```bash
git clone https://github.com/dthinkr/xhs-image-mcp.git
cd xhs-image-mcp
npm install
npx playwright install chromium
npm run build
```

## 使用

### MCP Server 配置

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "xhs-image": {
      "command": "npx",
      "args": ["-y", "xhs-image-mcp"],
      "env": {
        "GEMINI_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

**Claude Code** (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "xhs-image": {
      "command": "npx",
      "args": ["-y", "xhs-image-mcp"]
    }
  }
}
```

### 测试

```bash
npm test
```

## MCP Tools

### `text_to_images`

将文本转换为图片序列。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | Yes | 文本内容 |
| `title` | string | | 标题（用于封面） |
| `theme` | string | | `minimal` / `elegant` / `warm` / `dark` |
| `ratio` | string | | `3:4` / `1:1` / `4:3` |
| `fontSize` | string | | `small` / `medium` / `large` |
| `showCover` | boolean | | 是否生成封面页 |
| `generateAiCover` | boolean | | 使用 AI 生成封面图（设置 API Key 后默认开启，传 `false` 可禁用） |
| `outputDir` | string | | 输出目录，图片保存为 PNG |

### `file_to_images`

将 Markdown/文本文件转换为图片。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `filePath` | string | Yes | 文件路径 (.md/.txt) |
| `title` | string | | 覆盖自动提取的标题 |
| `theme` | string | | 主题 |
| `generateAiCover` | boolean | | AI 封面（设置 API Key 后默认开启，传 `false` 可禁用） |
| `outputDir` | string | | 输出目录 |

### `estimate_pages`

估算页数（不生成图片）。

### `list_themes`

列出所有可用主题。

## 主题

| 主题 | 风格 | 适用场景 |
|------|------|----------|
| `minimal` | 白底黑字，简约 | 知识干货、教程 |
| `elegant` | 米白衬线，书卷气 | 小说、散文、诗歌 |
| `warm` | 暖色渐变，卡片式 | 情感生活、分享 |
| `dark` | 深色护眼 | 夜间阅读、科技 |

## 环境变量

| 变量 | 说明 |
|------|------|
| `GEMINI_API_KEY` | Google Gemini API Key，用于 AI 封面生成（设置后自动启用 AI 封面） |

获取 API Key: https://aistudio.google.com/app/apikey

## License

MIT
