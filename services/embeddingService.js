import axios from 'axios';

export const EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
export const EMBED_DIMENSIONS = Number(process.env.EMBED_DIMENSIONS) || 768;

export async function embedText(text) {
  const input = (text || '').trim();
  if (!input || !process.env.GEMINI_API_KEY) return null;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
      {
        content: { parts: [{ text: input }] },
        outputDimensionality: EMBED_DIMENSIONS,
      },
      {
        timeout: 20000,
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    const values = response.data?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBED_DIMENSIONS) {
      console.error('Embedding size mismatch', values?.length);
      return null;
    }
    return values;
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error('Embedding request failed', detail);
    return null;
  }
}
