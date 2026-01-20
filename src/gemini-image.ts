/**
 * Gemini Image Generator - Generates cover images using Google's Gemini API
 * Uses the Imagen model for image generation
 */

export interface GeminiImageOptions {
  apiKey?: string;
  aspectRatio?: '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
}

export interface GeneratedImage {
  base64: string;
  prompt: string;
  mimeType: string;
}

/**
 * Generate an image prompt based on article content
 */
export function generateImagePrompt(title: string, content: string, theme: string): string {
  // Extract key themes from content
  const contentPreview = content.slice(0, 500);

  // Theme-specific style hints
  const themeStyles: Record<string, string> = {
    minimal: 'minimalist, clean, modern design, white space, subtle colors',
    elegant: 'elegant, sophisticated, warm tones, classic aesthetic, literary feel',
    warm: 'warm, cozy, soft lighting, pastel colors, inviting atmosphere',
    dark: 'dark mode aesthetic, moody, high contrast, neon accents, modern'
  };

  const styleHint = themeStyles[theme] || themeStyles.minimal;

  // Create a focused prompt for the cover image
  const prompt = `Create an artistic illustration for an article titled "${title}".
Style: ${styleHint}.
The image should be visually appealing as a cover image for social media,
abstract and artistic rather than literal,
suitable for Xiaohongshu (Chinese lifestyle platform).
No text or words in the image.
High quality, professional design.`;

  return prompt;
}

/**
 * Generate an image using Gemini 2.0 Flash (native image generation)
 * This is the approach used by nano-banana-pro MCP
 */
export async function generateCoverImage(
  title: string,
  content: string,
  theme: string,
  options: GeminiImageOptions = {}
): Promise<GeneratedImage | null> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not set. Skipping cover image generation.');
    return null;
  }

  const prompt = generateImagePrompt(title, content, theme);

  // Map aspect ratios
  const ratioMap: Record<string, string> = {
    '3:4': '3:4',
    '1:1': '1:1',
    '4:3': '4:3'
  };
  const aspectRatio = ratioMap[options.aspectRatio || '3:4'] || '3:4';

  try {
    // Use Imagen 4 model for high quality image generation
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: aspectRatio,
            safetyFilterLevel: 'BLOCK_LOW_AND_ABOVE',
            personGeneration: 'DONT_ALLOW'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini Imagen API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    // Extract image from Imagen response
    if (data.predictions && data.predictions.length > 0) {
      const prediction = data.predictions[0];
      return {
        base64: prediction.bytesBase64Encoded,
        prompt: prompt,
        mimeType: prediction.mimeType || 'image/png'
      };
    }

    return null;
  } catch (error) {
    console.error('Error generating cover image:', error);
    return null;
  }
}

/**
 * Alternative: Generate image using Gemini's generative model with image output
 * This uses the gemini-2.0-flash-exp model that can generate images
 */
export async function generateCoverImageV2(
  title: string,
  content: string,
  theme: string,
  options: GeminiImageOptions = {}
): Promise<GeneratedImage | null> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error('GEMINI_API_KEY not set. Skipping cover image generation.');
    return null;
  }

  const prompt = generateImagePrompt(title, content, theme);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            responseModalities: ['image', 'text'],
            responseMimeType: 'image/png'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    // Extract image from response
    if (data.candidates && data.candidates[0]?.content?.parts) {
      for (const part of data.candidates[0].content.parts) {
        if (part.inlineData) {
          return {
            base64: part.inlineData.data,
            prompt: prompt,
            mimeType: part.inlineData.mimeType || 'image/png'
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Error generating cover image:', error);
    return null;
  }
}
