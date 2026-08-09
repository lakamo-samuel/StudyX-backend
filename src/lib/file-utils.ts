import axios from "axios";
import cloudinary from "../config/cloudinary";

export async function extractDocxText(buffer: Buffer): Promise<string | null> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value?.trim() || null;
  } catch {
    return null;
  }
}

export async function extractPptxText(buffer: Buffer): Promise<string | null> {
  try {
    // Try to import jszip — if not available, skip PPTX processing
    let JSZip;
    try {
      JSZip = (await import("jszip")).default;
    } catch {
      console.warn("⚠️  jszip not installed — cannot extract PPTX text");
      return null;
    }

    const zip = new JSZip();
    await zip.loadAsync(buffer);

    const slides = Object.keys(zip.files)
      .filter((path) => path.startsWith("ppt/slides/slide") && path.endsWith(".xml"))
      .sort();

    if (slides.length === 0) {
      console.warn("⚠️  No slides found in PPTX");
      return null;
    }

    const textParts: string[] = [];

    for (const slide of slides) {
      const file = zip.files[slide];
      if (file) {
        const content = await file.async("string");
        
        // Extract text from <a:t> tags (PowerPoint text elements)
        const textMatches = content.match(/<a:t>([^<]*)<\/a:t>/g) || [];
        
        // Also try to extract from other text containers if initial match is empty
        if (textMatches.length === 0) {
          // Fallback: look for any text nodes
          const fallbackMatches = content.match(/>([^<]{10,})</g) || [];
          fallbackMatches.forEach((match) => {
            const text = match.slice(1, -1).trim();
            if (text.length > 3 && !text.includes("xmlns") && !text.includes("http")) {
              textParts.push(text);
            }
          });
        } else {
          textMatches.forEach((match) => {
            const text = match.replace(/<\/?a:t>/g, "").trim();
            if (text) textParts.push(text);
          });
        }
      }
    }

    const fullText = textParts.join("\n").trim();
    
    // Require at least 100 chars to consider extraction successful (was 50, now stricter)
    if (fullText.length < 100) {
      console.warn(`⚠️  PPTX extracted only ${fullText.length} chars (insufficient for summary)`);
      return null;
    }
    
    console.log(`✅ PPTX text extracted: ${fullText.length} chars from ${slides.length} slides`);
    return fullText;
  } catch (err) {
    console.warn(`⚠️  PPTX extraction error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

export function extractPublicId(url: string): string | null {
  try {
    const match = url.match(
      /\/(?:image|raw|video)\/(?:upload|authenticated)\/(?:v\d+\/)?(.+?)(?:\.[^/.]+)?$/,
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Download file from Cloudinary with exponential backoff retry.
 * Returns buffer on success, null on failure.
 * Attempts: direct fetch → signed URL → null.
 */
export async function downloadFromCloudinary(
  fileUrl: string,
  maxRetries: number = 3,
): Promise<{ buffer: Buffer | null; error?: string }> {
  const timeouts = [30000, 60000, 90000]; // 30s, 60s, 90s

  // ── Strategy 1: Direct fetch with retry ──
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeout = timeouts[attempt] ?? 90000;
      console.log(
        `📥 Direct fetch attempt ${attempt + 1}/${maxRetries} (timeout: ${timeout}ms)`,
      );

      const response = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: "arraybuffer",
        timeout,
      });

      console.log(`✅ File downloaded (${response.data.byteLength} bytes)`);
      return { buffer: Buffer.from(response.data) };
    } catch (err: any) {
      const status = err.response?.status;
      const msg = err.message ?? "Unknown error";

      if (status === 404) {
        return { buffer: null, error: `File not found (404): ${fileUrl}` };
      }

      if (status !== 401 && status !== 403 && attempt === maxRetries - 1) {
        // Final attempt failed with non-auth error
        console.warn(
          `⚠️  Direct fetch failed after ${maxRetries} attempts (${status ?? "network"}): ${msg}`,
        );
        return { buffer: null, error: `Failed to fetch: ${msg}` };
      }

      if (status === 401 || status === 403) {
        // Auth error, try signed URL
        break;
      }

      // Retry for network errors
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // ── Strategy 2: Signed URL download ──
  try {
    console.log("🔑 Attempting signed URL download...");
    const publicId = extractPublicId(fileUrl);
    if (!publicId) {
      return { buffer: null, error: "Could not extract public ID from URL" };
    }

    const resourceType = fileUrl.includes("/raw/") ? "raw" : "image";

    const signedUrl = cloudinary.url(publicId, {
      sign_url: true,
      secure: true,
      type: "upload",
      resource_type: resourceType,
    });

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const timeout = 90000; // 90s for signed URL
        const response = await axios.get<ArrayBuffer>(signedUrl, {
          responseType: "arraybuffer",
          timeout,
        });

        console.log(`✅ Signed URL download succeeded (${response.data.byteLength} bytes)`);
        return { buffer: Buffer.from(response.data) };
      } catch (err: any) {
        if (attempt === 0) {
          const delay = 2000;
          console.log(`⏳ Signed URL retry in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          return {
            buffer: null,
            error: `Signed URL failed: ${err.message?.split("\n")[0] ?? "Unknown"}`,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn(
      `⚠️  Signed URL attempt failed: ${err.message?.split("\n")[0] ?? "Unknown"}`,
    );
    return {
      buffer: null,
      error: `Signed URL error: ${err.message?.split("\n")[0] ?? "Unknown"}`,
    };
  }

  return { buffer: null, error: "All download strategies exhausted" };
}
