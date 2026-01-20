/**
 * 文本分页器 - 将长文本按字数分割成多页
 * 支持动态字符计数（基于文本类型自动调整）
 */

export interface PaginatorOptions {
  charsPerPage?: number;  // 每页字数，默认根据字号自动计算
  firstPageChars?: number;  // 第一页字数（有标题横幅时空间更小）
  fontSize?: 'small' | 'medium' | 'large';
  ratio?: '3:4' | '1:1' | '4:3';
  dynamicCount?: boolean;  // 是否动态计算（根据中英文比例调整）
  hasTitle?: boolean;  // 是否有标题（影响第一页可用空间）
}

// 基础字符数（按中文计算，保守估计以防溢出）
const BASE_CHARS_PER_PAGE: Record<string, Record<string, number>> = {
  '3:4': {
    small: 420,
    medium: 320,
    large: 240
  },
  '1:1': {
    small: 300,
    medium: 230,
    large: 180
  },
  '4:3': {
    small: 250,
    medium: 200,
    large: 150
  }
};

/**
 * 检测文本中英文字符的比例
 * 返回值: 0 = 全中文, 1 = 全英文
 */
function detectEnglishRatio(text: string): number {
  const cleaned = text.replace(/\s+/g, '');
  if (cleaned.length === 0) return 0;

  // 匹配英文字母和数字
  const englishChars = cleaned.match(/[a-zA-Z0-9]/g) || [];
  return englishChars.length / cleaned.length;
}

/**
 * 根据中英文比例调整字符数
 * 英文字符平均宽度约为中文的0.5倍，所以英文文本可以容纳更多字符
 */
function adjustCharsForLanguage(baseChars: number, englishRatio: number): number {
  // 英文比例越高，可容纳的字符越多（最多增加70%）
  const multiplier = 1 + (englishRatio * 0.7);
  return Math.floor(baseChars * multiplier);
}

export interface Page {
  content: string;
  pageNumber: number;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * 将文本分割成多页
 */
export function paginateText(text: string, options: PaginatorOptions = {}): Page[] {
  const {
    fontSize = 'medium',
    ratio = '3:4',
    charsPerPage,
    firstPageChars,
    dynamicCount = true,  // 默认启用动态计算
    hasTitle = false  // 是否有标题横幅
  } = options;

  // 获取基础字符数
  const baseChars = charsPerPage || BASE_CHARS_PER_PAGE[ratio]?.[fontSize] || 350;

  // 动态调整：根据文本的中英文比例调整字符数
  let maxChars = baseChars;
  if (dynamicCount && !charsPerPage) {
    const englishRatio = detectEnglishRatio(text);
    maxChars = adjustCharsForLanguage(baseChars, englishRatio);
  }

  // 第一页字符数（有标题横幅时减少约25%）
  const firstPageMaxChars = firstPageChars || (hasTitle ? Math.floor(maxChars * 0.75) : maxChars);

  // 清理文本：统一换行符，去除多余空白
  const cleanedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // 按段落分割
  const paragraphs = cleanedText.split(/\n+/).filter(p => p.trim());

  const pages: Page[] = [];
  let currentPageContent = '';
  let currentCharCount = 0;

  // 获取当前页的最大字符数
  const getCurrentMaxChars = () => pages.length === 0 ? firstPageMaxChars : maxChars;

  for (let i = 0; i < paragraphs.length; i++) {
    const paragraph = paragraphs[i].trim();
    const paragraphLength = paragraph.length;
    const currentMaxChars = getCurrentMaxChars();

    // 如果当前段落加上已有内容超过限制
    if (currentCharCount + paragraphLength > currentMaxChars && currentPageContent) {
      // 保存当前页
      pages.push({
        content: currentPageContent.trim(),
        pageNumber: pages.length + 1,
        isFirst: pages.length === 0,
        isLast: false
      });
      currentPageContent = '';
      currentCharCount = 0;
    }

    const newMaxChars = getCurrentMaxChars();

    // 如果单个段落超过一页
    if (paragraphLength > newMaxChars) {
      // 按句子分割长段落
      const sentences = splitIntoSentences(paragraph);

      for (const sentence of sentences) {
        const sentenceMaxChars = getCurrentMaxChars();
        if (currentCharCount + sentence.length > sentenceMaxChars && currentPageContent) {
          pages.push({
            content: currentPageContent.trim(),
            pageNumber: pages.length + 1,
            isFirst: pages.length === 0,
            isLast: false
          });
          currentPageContent = '';
          currentCharCount = 0;
        }
        currentPageContent += sentence;
        currentCharCount += sentence.length;
      }
    } else {
      // 正常添加段落
      currentPageContent += paragraph + '\n\n';
      currentCharCount += paragraphLength;
    }
  }

  // 添加最后一页
  if (currentPageContent.trim()) {
    pages.push({
      content: currentPageContent.trim(),
      pageNumber: pages.length + 1,
      isFirst: pages.length === 0,
      isLast: true
    });
  }

  // 标记最后一页
  if (pages.length > 0) {
    pages[pages.length - 1].isLast = true;
  }

  return pages;
}

/**
 * 按句子分割文本（支持中英文）
 */
function splitIntoSentences(text: string): string[] {
  // 中文句子结束符：。！？；
  // 英文句子结束符：. ! ?
  const sentenceEnders = /([。！？；.!?]+)/g;
  const parts = text.split(sentenceEnders);

  const sentences: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i] + (parts[i + 1] || '');
    if (sentence.trim()) {
      sentences.push(sentence);
    }
  }

  return sentences;
}

/**
 * 估算总页数
 */
export function estimatePageCount(text: string, options: PaginatorOptions = {}): number {
  const pages = paginateText(text, options);
  return pages.length;
}
