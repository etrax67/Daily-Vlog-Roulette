import { GoogleGenAI, Type } from "@google/genai";

// Ensure API key is present
const apiKey = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

/**
 * Converts a Blob to a Base64 string.
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:video/webm;base64,")
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

interface VlogMetadata {
  title: string;
  transcription: string;
  summary: string;
}

/**
 * Analyzes a video blob to generate a title, transcription, and summary using Gemini.
 */
export const analyzeVlogContent = async (videoBlob: Blob): Promise<VlogMetadata> => {
  try {
    const base64Video = await blobToBase64(videoBlob);
    
    // Sanitize MIME type: Gemini expects simple types like "video/webm" without parameters (codecs)
    let mimeType = videoBlob.type || 'video/webm';
    if (mimeType.includes(';')) {
        mimeType = mimeType.split(';')[0];
    }

    // We use gemini-2.5-flash for speed and multimodal capabilities
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Video
            }
          },
          {
            text: `Analyze this daily vlog video. 
            1. Transcribe the audio verbatim.
            2. Generate a catchy, short title (max 5 words).
            3. Write a 1-sentence summary of what happened.
            
            Return the result in JSON format.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            transcription: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["title", "transcription", "summary"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text) as VlogMetadata;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Fallback if AI fails
    return {
      title: "Daily Vlog",
      transcription: "Transcription unavailable.",
      summary: "A vlog recorded today."
    };
  }
};