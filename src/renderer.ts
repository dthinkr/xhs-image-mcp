/**
 * Playwright 渲染器 - 将 HTML 渲染成图片
 */

import { chromium, Browser, Page as PlaywrightPage } from 'playwright';
import { Page } from './paginator.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type Theme = 'minimal' | 'elegant' | 'warm' | 'dark';
export type Ratio = '3:4' | '1:1' | '4:3';
export type FontSize = 'small' | 'medium' | 'large';

export interface RenderOptions {
  theme?: Theme;
  ratio?: Ratio;
  fontSize?: FontSize;
  title?: string;
  showCover?: boolean;
  aiCoverImage?: string;  // Base64 encoded AI-generated cover image
}

// 图片尺寸配置 (宽 x 高)
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

/**
 * 获取浏览器实例（单例）
 */
async function getBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  return browser;
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

/**
 * 加载主题 CSS
 */
function loadThemeCSS(theme: Theme): string {
  const themePath = join(__dirname, 'themes', `${theme}.css`);
  try {
    return readFileSync(themePath, 'utf-8');
  } catch {
    // 如果文件不存在，返回 minimal 主题
    const minimalPath = join(__dirname, 'themes', 'minimal.css');
    return readFileSync(minimalPath, 'utf-8');
  }
}

/**
 * 将段落文本转换为 HTML，支持分隔线
 */
function paragraphsToHtml(content: string): string {
  return content
    .split(/\n+/)
    .filter(p => p.trim())
    .map(p => {
      // 检测分隔线 (---, ***, ___)
      if (/^[-*_]{3,}$/.test(p.trim())) {
        return '<hr class="divider" />';
      }
      return `<p>${escapeHtml(p)}</p>`;
    })
    .join('\n');
}

/**
 * 生成内容页 HTML
 */
function generateContentHTML(
  page: Page,
  totalPages: number,
  options: RenderOptions
): string {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  // 将换行转换为段落，支持分隔线
  const paragraphs = paragraphsToHtml(page.content);

  return `<!DOCTYPE html>
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
      ${paragraphs}
    </div>
    <div class="page-number">
      <span>${page.pageNumber}</span> / ${totalPages}
    </div>
  </div>
</body>
</html>`;
}

/**
 * 生成第一页 HTML（带标题和正文，文字版）
 */
function generateFirstPageWithTitleHTML(
  title: string,
  page: Page,
  totalPages: number,
  options: RenderOptions
): string {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  // 将换行转换为段落，支持分隔线
  const paragraphs = paragraphsToHtml(page.content);

  return `<!DOCTYPE html>
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
    <h1 class="title">${escapeHtml(title)}</h1>
    <div class="content">
      ${paragraphs}
    </div>
    <div class="page-number">
      <span>${page.pageNumber}</span> / ${totalPages}
    </div>
  </div>
</body>
</html>`;
}

/**
 * 生成带AI图片背景的第一页 HTML（AI图只作为标题背景，正文用主题样式）
 */
function generateAICoverWithContentHTML(
  title: string,
  aiImageBase64: string,
  mimeType: string,
  page: Page,
  totalPages: number,
  options: RenderOptions
): string {
  const { theme = 'minimal', fontSize = 'medium' } = options;
  const css = loadThemeCSS(theme);
  const fontConfig = FONT_SIZES[fontSize];

  // 将换行转换为段落，支持分隔线
  const paragraphs = paragraphsToHtml(page.content);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${css}
    .title { font-size: ${fontConfig.title}px; }
    .content { font-size: ${fontConfig.content}px; }

    /* AI 标题背景区域 */
    .title-banner {
      position: relative;
      margin: -50px -50px 30px -50px;
      padding: 40px 50px;
      overflow: hidden;
    }
    .title-banner-bg {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 1;
    }
    .title-banner-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 100%);
      z-index: 2;
    }
    .title-banner h1 {
      position: relative;
      z-index: 3;
      color: #ffffff;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      border: none;
      padding: 0;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="title-banner">
      <img class="title-banner-bg" src="data:${mimeType};base64,${aiImageBase64}" alt="bg" />
      <div class="title-banner-overlay"></div>
      <h1 class="title">${escapeHtml(title)}</h1>
    </div>
    <div class="content">
      ${paragraphs}
    </div>
    <div class="page-number">
      <span>${page.pageNumber}</span> / ${totalPages}
    </div>
  </div>
</body>
</html>`;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 渲染单页为图片
 */
async function renderPage(
  html: string,
  dimensions: { width: number; height: number }
): Promise<Buffer> {
  const browserInstance = await getBrowser();
  const page = await browserInstance.newPage();

  try {
    await page.setViewportSize(dimensions);
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 等待字体加载
    await page.waitForTimeout(100);

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    return screenshot;
  } finally {
    await page.close();
  }
}

/**
 * 将多页文本渲染为图片
 */
export async function renderPages(
  pages: Page[],
  options: RenderOptions = {}
): Promise<Buffer[]> {
  const {
    ratio = '3:4',
    title,
    showCover = false,
    aiCoverImage
  } = options;

  const dimensions = DIMENSIONS[ratio];
  const images: Buffer[] = [];
  const totalPages = pages.length;

  // 渲染页面
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let html: string;

    if (i === 0 && showCover && title) {
      // 第一页：如果有AI封面，用AI背景+标题+内容；否则用带标题的普通内容页
      if (aiCoverImage) {
        html = generateAICoverWithContentHTML(title, aiCoverImage, 'image/png', page, totalPages, options);
      } else {
        // 文字版封面+内容的第一页
        html = generateFirstPageWithTitleHTML(title, page, totalPages, options);
      }
    } else {
      // 其他页：普通内容页
      html = generateContentHTML(page, totalPages, options);
    }

    const image = await renderPage(html, dimensions);
    images.push(image);
  }

  return images;
}

/**
 * 完整的文本转图片流程
 */
export async function textToImages(
  text: string,
  pages: Page[],
  options: RenderOptions = {}
): Promise<{ images: string[]; pageCount: number }> {
  const imageBuffers = await renderPages(pages, options);

  // 转换为 base64
  const images = imageBuffers.map(buffer => buffer.toString('base64'));

  return {
    images,
    pageCount: images.length
  };
}
