/**
 * 自动分页器 - 使用浏览器实际测量来分页
 * 不再依赖估算字数，而是真正渲染并检测溢出
 */

import { chromium, Browser } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Theme = 'minimal' | 'elegant' | 'warm' | 'dark';
export type Ratio = '3:4' | '1:1' | '4:3';
export type FontSize = 'small' | 'medium' | 'large';

export interface AutoPaginatorOptions {
  theme?: Theme;
  ratio?: Ratio;
  fontSize?: FontSize;
  hasTitle?: boolean;  // 第一页是否有标题
  hasAICover?: boolean; // 第一页是否有AI封面（占用更多空间）
}

export interface Page {
  content: string;
  pageNumber: number;
  isFirst: boolean;
  isLast: boolean;
}

// 图片尺寸配置
const DIMENSIONS: Record<Ratio, { width: number; height: number }> = {
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 },
  '4:3': { width: 1080, height: 810 }
};

// 字号配置
const FONT_SIZES: Record<FontSize, { title: number; content: number }> = {
  small: { title: 36, content: 24 },
  medium: { title: 42, content: 28 },
  large: { title: 48, content: 32 }
};

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

export async function closeAutoPaginatorBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

function loadThemeCSS(theme: Theme): string {
  const themePath = join(__dirname, 'themes', `${theme}.css`);
  try {
    return readFileSync(themePath, 'utf-8');
  } catch {
    const minimalPath = join(__dirname, 'themes', 'minimal.css');
    return readFileSync(minimalPath, 'utf-8');
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 生成测量用的 HTML
 */
function generateMeasureHTML(
  paragraphs: string[],
  options: AutoPaginatorOptions,
  isFirstPage: boolean
): string {
  const { theme = 'warm', fontSize = 'medium', hasTitle = false, hasAICover = false, ratio = '3:4' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];
  const dims = DIMENSIONS[ratio];

  const showTitle = isFirstPage && hasTitle;
  const showAICover = isFirstPage && hasAICover;

  const paragraphsHtml = paragraphs.map((p, i) => {
    if (/^[-*_]{3,}$/.test(p.trim())) {
      return `<hr class="divider" data-index="${i}" />`;
    }
    return `<p data-index="${i}">${escapeHtml(p)}</p>`;
  }).join('\n');

  // AI封面横幅模拟（与 renderer.ts 中的样式一致）
  const aiBannerHTML = showAICover ? `
    <div class="title-banner">
      <div class="title-banner-placeholder"></div>
      <h1 class="title">标题占位</h1>
    </div>
  ` : (showTitle ? '<h1 class="title" id="title-placeholder">标题占位</h1>' : '');

  const aiBannerCSS = showAICover ? `
    .title-banner {
      position: relative;
      margin: -32px -32px 25px -32px;
      padding: 35px 32px;
      background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
      min-height: 80px;
    }
    .title-banner h1 {
      color: #ffffff;
      margin: 0;
    }
  ` : '';

  // 关键：用 position: absolute 固定页码位置，让 content 高度由内容决定
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${css}
    html, body {
      margin: 0;
      padding: 0;
      width: ${dims.width}px;
      height: ${dims.height}px;
    }
    .page-container {
      width: ${dims.width - 80}px;
      height: ${dims.height - 80}px;
      margin: 45px 40px 35px;
      position: relative;
    }
    .title { font-size: ${fontConfig.title}px; }
    .content { 
      font-size: ${fontConfig.content}px; 
      flex: none !important;
    }
    .page-number {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
    }
    ${aiBannerCSS}
  </style>
</head>
<body>
  <div class="page-container">
    ${aiBannerHTML}
    <div class="content" id="content-area">
      ${paragraphsHtml}
    </div>
    <div class="page-number">
      <span>1</span> / 1
    </div>
  </div>
</body>
</html>`;
}

/**
 * 使用浏览器测量并自动分页
 */
export async function autoPaginate(
  text: string,
  options: AutoPaginatorOptions = {}
): Promise<Page[]> {
  const { ratio = '3:4', hasTitle = false } = options;
  const dimensions = DIMENSIONS[ratio];

  // 清理文本，按段落分割
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const allParagraphs = cleanedText.split(/\n+/).filter(p => p.trim());

  if (allParagraphs.length === 0) {
    return [];
  }

  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();
  await page.setViewportSize(dimensions);

  const pages: Page[] = [];
  let startIdx = 0;
  let pageNum = 0;

  try {
    while (startIdx < allParagraphs.length) {
      pageNum++;
      const isFirstPage = pageNum === 1;

      // 从 startIdx 开始，逐个添加段落直到溢出
      let endIdx = startIdx;
      
      for (let i = startIdx; i < allParagraphs.length; i++) {
        const testParagraphs = allParagraphs.slice(startIdx, i + 1);
        const html = generateMeasureHTML(testParagraphs, options, isFirstPage && hasTitle);
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        const overflows = await page.evaluate(() => {
          const content = document.getElementById('content-area') as HTMLElement;
          const pageNumber = document.querySelector('.page-number') as HTMLElement;
          if (!content || !pageNumber) return true;
          
          // 找最后一个内容元素（p 或 hr）
          const lastElement = content.querySelector('p:last-child, hr:last-child') as HTMLElement;
          if (!lastElement) return false;
          
          const lastBottom = lastElement.getBoundingClientRect().bottom;
          const pageNumTop = pageNumber.getBoundingClientRect().top;
          
          // 留 20px 安全边距
          return lastBottom > pageNumTop - 20;
        });

        if (overflows) {
          break;
        }
        endIdx = i + 1;
      }

      // 确保至少包含一个段落
      if (endIdx <= startIdx) {
        endIdx = startIdx + 1;
      }

      const pageContent = allParagraphs.slice(startIdx, endIdx).join('\n\n');
      pages.push({
        content: pageContent,
        pageNumber: pageNum,
        isFirst: pageNum === 1,
        isLast: endIdx >= allParagraphs.length
      });

      startIdx = endIdx;
    }
  } finally {
    await page.close();
  }

  return pages;
}

/**
 * 按句子分割文本
 */
function splitIntoSentences(text: string): string[] {
  const sentenceEnders = /([。！？；.!?]+)/g;
  const parts = text.split(sentenceEnders);

  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] + (parts[i + 1] || '');
    if (sentence.trim()) {
      sentences.push(sentence.trim());
    }
  }

  return sentences.length > 0 ? sentences : [text];
}
