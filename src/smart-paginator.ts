/**
 * 智能分页器 - 使用 Playwright 实际测量文本高度进行分页
 * 不再硬编码字符数，而是让浏览器告诉我们实际能放多少内容
 */

import { chromium, Browser, Page as PlaywrightPage } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Theme = 'minimal' | 'elegant' | 'warm' | 'dark';
export type Ratio = '3:4' | '1:1' | '4:3';
export type FontSize = 'small' | 'medium' | 'large';

export interface SmartPaginatorOptions {
  theme?: Theme;
  ratio?: Ratio;
  fontSize?: FontSize;
  hasTitle?: boolean;  // 第一页是否有标题横幅
  titleHeight?: number;  // 标题横幅高度（像素）
}

export interface SmartPage {
  content: string;
  pageNumber: number;
  isFirst: boolean;
  isLast: boolean;
  paragraphs: string[];  // 该页包含的段落
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

// 页面内边距和页码区域高度（根据 CSS 精确设置）
// elegant.css: body padding: 50px 50px 30px (top left/right bottom)
const PAGE_PADDING = {
  top: 50,
  bottom: 30,
  left: 50,
  right: 50
};
// page-number: margin-top: 20px + padding-top: 15px + font-size: 16px + line-height ≈ 60px
const PAGE_NUMBER_HEIGHT = 60;
// title-banner: 标题 font-size 42px * line-height 1.4 + margin-bottom 35px + border-bottom padding 20px ≈ 115px
const TITLE_BANNER_HEIGHT = 120;
// 额外安全边距，用于处理字体渲染差异
const SAFETY_MARGIN = 30;

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

export async function closeSmartPaginatorBrowser(): Promise<void> {
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
 * 将段落转换为 HTML，支持分隔线
 */
function paragraphToHtml(p: string): string {
  // 检测分隔线 (---, ***, ___)
  if (/^[-*_]{3,}$/.test(p.trim())) {
    return '<hr class="divider" />';
  }
  return `<p>${escapeHtml(p)}</p>`;
}

/**
 * 生成测量用的 HTML
 */
function generateMeasureHTML(
  paragraphs: string[],
  options: SmartPaginatorOptions,
  availableHeight: number
): string {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  const paragraphsHtml = paragraphs
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${css}
    .content { font-size: ${fontConfig.content}px; }
    .measure-container {
      width: ${1080 - PAGE_PADDING.left - PAGE_PADDING.right}px;
      padding: 0;
    }
  </style>
</head>
<body>
  <div class="measure-container">
    <div class="content">
      ${paragraphsHtml}
    </div>
  </div>
</body>
</html>`;
}

/**
 * 使用二分查找确定一页能容纳多少段落
 * 通过实际渲染并检测溢出来确定
 *
 * 关键：测量用的 HTML 结构必须与 renderer.ts 中的实际渲染结构完全一致
 */
async function findPageBreak(
  page: PlaywrightPage,
  paragraphs: string[],
  startIndex: number,
  options: SmartPaginatorOptions,
  availableHeight: number
): Promise<number> {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  // 二分查找能放下的最大段落数
  let low = 1;
  let high = paragraphs.length - startIndex;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const testParagraphs = paragraphs.slice(startIndex, startIndex + mid);

    // 使用与 renderer.ts generateContentHTML 完全相同的结构
    // 包括 body padding 和 page-container，支持分隔线
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${css}
    .title { font-size: ${fontConfig.title}px; }
    .content { font-size: ${fontConfig.content}px; }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="content">
      ${testParagraphs.map(p => paragraphToHtml(p)).join('\n')}
    </div>
    <div class="page-number">
      <span>1</span> / 1
    </div>
  </div>
</body>
</html>`;

    await page.setContent(html);
    await page.waitForLoadState('networkidle');

    // 测量 content 区域的实际高度
    const contentHeight = await page.evaluate(() => {
      const content = document.querySelector('.content');
      return content ? content.getBoundingClientRect().height : 0;
    });

    if (contentHeight <= availableHeight) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result > 0 ? result : 1;  // 至少放一个段落
}

/**
 * 测量实际可用的内容高度
 * 通过渲染一个带有占位内容的页面，然后测量 .content 区域的最大可用高度
 */
async function measureAvailableHeight(
  page: PlaywrightPage,
  options: SmartPaginatorOptions,
  hasTitle: boolean,
  dimensions: { width: number; height: number }
): Promise<number> {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  // 创建一个模拟页面，content 使用 flex: 1 会自动填充剩余空间
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${css}
    .title { font-size: ${fontConfig.title}px; }
    .content { font-size: ${fontConfig.content}px; }
    html, body {
      height: ${dimensions.height}px;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div class="page-container" style="height: 100%;">
    ${hasTitle ? `<h1 class="title">测试标题</h1>` : ''}
    <div class="content" id="measure-content">
      <p>测量用占位符</p>
    </div>
    <div class="page-number">
      <span>1</span> / 1
    </div>
  </div>
</body>
</html>`;

  await page.setContent(html);
  await page.waitForLoadState('networkidle');

  // 测量 content 区域能使用的最大高度
  const availableHeight = await page.evaluate(() => {
    const content = document.getElementById('measure-content');
    if (!content) return 0;
    // 获取 content 元素的计算高度（flex: 1 会自动扩展）
    const rect = content.getBoundingClientRect();
    return rect.height;
  });

  // 减去安全边距
  return availableHeight - SAFETY_MARGIN;
}

/**
 * 智能分页：使用二分查找确定每页能容纳的段落数
 */
export async function smartPaginate(
  text: string,
  options: SmartPaginatorOptions = {}
): Promise<SmartPage[]> {
  const {
    ratio = '3:4',
    hasTitle = false
  } = options;

  const dimensions = DIMENSIONS[ratio];

  // 清理文本并分割成段落
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = cleanedText.split(/\n+/).filter(p => p.trim());

  if (paragraphs.length === 0) {
    return [];
  }

  // 启动浏览器测量
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();
  await page.setViewportSize({ width: 1080, height: dimensions.height });

  try {
    // 动态测量可用高度
    const firstPageContentHeight = await measureAvailableHeight(page, options, hasTitle, dimensions);
    const baseContentHeight = await measureAvailableHeight(page, options, false, dimensions);

    console.log(`Available heights - First page: ${firstPageContentHeight}px, Other pages: ${baseContentHeight}px`);

    const pages: SmartPage[] = [];
    let currentIndex = 0;

    while (currentIndex < paragraphs.length) {
      const isFirstPage = pages.length === 0;
      const availableHeight = isFirstPage ? firstPageContentHeight : baseContentHeight;

      // 使用二分查找确定这一页能放多少段落
      const count = await findPageBreak(page, paragraphs, currentIndex, options, availableHeight);

      const pageParagraphs = paragraphs.slice(currentIndex, currentIndex + count);

      pages.push({
        content: pageParagraphs.join('\n\n'),
        pageNumber: pages.length + 1,
        isFirst: isFirstPage,
        isLast: false,
        paragraphs: pageParagraphs
      });

      currentIndex += count;
    }

    // 标记最后一页
    if (pages.length > 0) {
      pages[pages.length - 1].isLast = true;
    }

    return pages;
  } finally {
    await page.close();
  }
}

/**
 * 使用智能分页的简化接口，兼容旧的 Page 接口
 */
export async function smartPaginateCompat(
  text: string,
  options: SmartPaginatorOptions = {}
): Promise<{ content: string; pageNumber: number; isFirst: boolean; isLast: boolean }[]> {
  const pages = await smartPaginate(text, options);
  return pages.map(p => ({
    content: p.content,
    pageNumber: p.pageNumber,
    isFirst: p.isFirst,
    isLast: p.isLast
  }));
}
