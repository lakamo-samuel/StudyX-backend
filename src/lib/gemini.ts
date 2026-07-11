import {
  GoogleGenerativeAI,
  Part,
} from "@google/generative-ai";
import axios from "axios";
import { env } from "../config/env";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/** Generate text content from a plain text prompt. */
export const generateContent = async (prompt: string): Promise<string> => {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Gemini error:", error);
    throw error;
  }
};

/**
 * Generate content from a file URL (PDF, image, or plain text).
 * Gemini Flash supports inline data for PDFs and images up to 20 MB.
 */
export const generateFromFileUrl = async (
  prompt: string,
  fileUrl: string,
  mimeType: string,
): Promise<string> => {
  try {
    if (!fileUrl) throw new Error("fileUrl is required");

    // Use axios for reliable binary fetching — native fetch has issues with empty statusText
    const response = await axios.get<ArrayBuffer>(fileUrl, {
      responseType: "arraybuffer",
      timeout: 30000,
    });

    const base64Data = Buffer.from(response.data).toString("base64");

    const parts: Part[] = [
      { text: prompt },
      { inlineData: { mimeType, data: base64Data } },
    ];

    const result = await model.generateContent(parts);
    return result.response.text();
  } catch (error: any) {
    // Surface the HTTP status if available to make debugging easier
    const status = error.response?.status;
    const msg = status
      ? `Failed to fetch file (HTTP ${status}): ${fileUrl}`
      : `Failed to fetch file: ${error.message}`;
    console.error("Gemini file error:", msg);
    throw new Error(msg);
  }
};

/** Map our file type enum to a MIME type Gemini understands. */
export const getMimeType = (fileType: string, fileName: string): string => {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "image":
      if (fileName.match(/\.png$/i)) return "image/png";
      if (fileName.match(/\.webp$/i)) return "image/webp";
      return "image/jpeg";
    case "txt":
      return "text/plain";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
};