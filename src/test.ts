/**
 * 测试脚本 - 直接运行测试图片生成
 */

import { paginateText } from './paginator.js';
import { textToImages, closeBrowser, Theme } from './renderer.js';
import { generateCoverImage } from './gemini-image.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// 中文测试文本
const testTextChinese = `
这是一个测试文本，用于验证文字转图片功能是否正常工作。

小红书是一个生活方式分享平台，用户可以在上面分享自己的日常生活、购物心得、旅行经历等。平台上的内容以图文形式为主，图片的质量和排版对内容的传播效果有很大影响。

我们开发的这个工具可以将长文本自动分割成多页，并渲染成精美的图片。每张图片都采用小红书常用的 3:4 比例，尺寸为 1080×1440 像素，在手机上显示效果最佳。

目前支持四种主题风格：
1. Minimal - 简约白底，适合知识干货类内容
2. Elegant - 书卷气质，适合小说散文类内容
3. Warm - 暖色调，适合情感生活类内容
4. Dark - 深色护眼，适合夜间阅读

每种主题都经过精心设计，确保文字清晰可读，排版美观大方。用户可以根据自己的内容类型选择合适的主题。

这个工具特别适合需要在小红书发布长文内容的创作者。只需要输入文本，选择主题，就能自动生成一系列图片，大大提高了内容创作的效率。
`;

// 英文测试文本
const testTextEnglish = `
The quick brown fox jumps over the lazy dog. This is a classic pangram used to test fonts and typography. It contains every letter of the English alphabet at least once.

In the world of digital content creation, visual presentation matters more than ever. Social media platforms like Instagram and Xiaohongshu have trained users to expect beautiful, well-designed content. A wall of text simply won't do anymore.

This text-to-image tool addresses that need by automatically converting long-form content into a series of beautifully formatted images. Each image is sized perfectly for mobile viewing, with a 3:4 aspect ratio that looks great on smartphone screens.

The tool supports multiple themes, each designed with careful attention to typography, spacing, and color. Whether you're sharing a recipe, a travel guide, or a personal essay, there's a theme that fits your content.

Key features include:
1. Automatic text pagination based on content length
2. Dynamic character counting that adapts to language
3. Multiple theme options for different content types
4. High-resolution output for crisp display on retina screens

Typography is both an art and a science. Good typography makes reading effortless, while poor typography creates friction that drives readers away. This tool applies best practices in typography to ensure your content looks professional.
`;

async function runTest() {
  console.log('开始测试...\n');

  // 创建输出目录
  const outputDir = join(process.cwd(), 'test-output');
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {}

  const themes: Theme[] = ['minimal', 'elegant', 'warm', 'dark'];

  // 测试中文
  console.log('\n========== 中文测试 ==========');
  for (const theme of themes) {
    console.log(`\n测试主题: ${theme}`);
    console.log('='.repeat(40));

    const pages = paginateText(testTextChinese, { fontSize: 'medium', ratio: '3:4' });
    console.log(`文本分页数: ${pages.length}`);

    const result = await textToImages(testTextChinese, pages, {
      theme,
      ratio: '3:4',
      fontSize: 'medium',
      title: '测试标题',
      showCover: true
    });

    console.log(`生成图片数: ${result.pageCount}`);

    result.images.forEach((base64, index) => {
      const filename = `${theme}-zh-page-${index + 1}.png`;
      const filepath = join(outputDir, filename);
      writeFileSync(filepath, Buffer.from(base64, 'base64'));
      console.log(`  保存: ${filename}`);
    });
  }

  // 测试英文
  console.log('\n========== 英文测试 ==========');
  for (const theme of themes) {
    console.log(`\n测试主题: ${theme}`);
    console.log('='.repeat(40));

    const pages = paginateText(testTextEnglish, { fontSize: 'medium', ratio: '3:4' });
    console.log(`文本分页数: ${pages.length} (动态调整后)`);

    const result = await textToImages(testTextEnglish, pages, {
      theme,
      ratio: '3:4',
      fontSize: 'medium',
      title: 'Test Title',
      showCover: true
    });

    console.log(`生成图片数: ${result.pageCount}`);

    result.images.forEach((base64, index) => {
      const filename = `${theme}-en-page-${index + 1}.png`;
      const filepath = join(outputDir, filename);
      writeFileSync(filepath, Buffer.from(base64, 'base64'));
      console.log(`  保存: ${filename}`);
    });
  }

  // 测试 AI 封面生成（如果有 GEMINI_API_KEY）
  if (process.env.GEMINI_API_KEY) {
    console.log('\n========== AI 封面测试 ==========');
    const title = '秋日私语：一个人的下午茶时光';

    console.log('正在生成 AI 封面图片...');
    const coverResult = await generateCoverImage(title, testTextChinese, 'warm', {
      aspectRatio: '3:4'
    });

    if (coverResult) {
      console.log('AI 封面生成成功！');
      console.log(`使用的 Prompt: ${coverResult.prompt.slice(0, 100)}...`);

      // 保存原始 AI 图片
      const aiFilename = 'ai-cover-raw.png';
      writeFileSync(join(outputDir, aiFilename), Buffer.from(coverResult.base64, 'base64'));
      console.log(`  保存原始 AI 图片: ${aiFilename}`);

      // 生成带 AI 封面的完整图文
      const pages = paginateText(testTextChinese, { fontSize: 'medium', ratio: '3:4' });
      const result = await textToImages(testTextChinese, pages, {
        theme: 'warm',
        ratio: '3:4',
        fontSize: 'medium',
        title,
        showCover: true,
        aiCoverImage: coverResult.base64
      });

      result.images.forEach((base64, index) => {
        const filename = `ai-cover-warm-page-${index + 1}.png`;
        const filepath = join(outputDir, filename);
        writeFileSync(filepath, Buffer.from(base64, 'base64'));
        console.log(`  保存: ${filename}`);
      });
    } else {
      console.log('AI 封面生成失败（可能是 API 调用出错）');
    }
  } else {
    console.log('\n跳过 AI 封面测试（未设置 GEMINI_API_KEY）');
  }

  await closeBrowser();
  console.log(`\n测试完成！图片保存在: ${outputDir}`);
}

runTest().catch(console.error);
