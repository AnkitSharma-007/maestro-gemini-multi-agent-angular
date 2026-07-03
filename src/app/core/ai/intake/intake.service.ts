import { inject, Service } from '@angular/core';
import type { Part } from '@google/genai';
import { loadGenaiSdk } from '../genai-loader';
import { ApiKeyService } from '../../auth/api-key.service';
import { MissingApiKeyError } from '../../types/agent.types';

/** Modalities accepted by the intake step. Kept narrow to what Gemini reads natively. */
export const INTAKE_ACCEPT = 'image/*,application/pdf';
/** Guard against oversized inline payloads (base64 inflates ~33%). */
export const MAX_INTAKE_BYTES = 10 * 1024 * 1024; // 10 MB

/** User-facing, already-friendly validation failure (shown directly, no sanitizing). */
export class IntakeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeValidationError';
  }
}

const INTAKE_INSTRUCTION = [
  'You are helping a user start an event-planning brief for a multi-agent planner.',
  'Read the attached image or document and write ONE concise paragraph (2-5 sentences)',
  'describing the event to plan. Capture every concrete detail you can see: city/location,',
  'dates or duration, attendee count, budget, theme, target audience, and format.',
  'Do not invent details that are not present. Output only the brief text with no preamble,',
  'labels, or markdown.',
].join(' ');

@Service()
export class IntakeService {
  private readonly apiKeys = inject(ApiKeyService);

  /** Throws IntakeValidationError when the file is an unsupported type or too large. */
  validateFile(file: File): void {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    if (!isImage && !isPdf) {
      throw new IntakeValidationError(
        'Unsupported file. Attach an image (PNG, JPG, WebP) or a PDF.',
      );
    }
    if (file.size > MAX_INTAKE_BYTES) {
      throw new IntakeValidationError(
        `That file is too large. Keep attachments under ${Math.floor(
          MAX_INTAKE_BYTES / (1024 * 1024),
        )} MB.`,
      );
    }
  }

  /** Read a file into a base64 inlineData part (data URL prefix stripped). */
  async fileToInlineData(file: File): Promise<{ mimeType: string; data: string }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the selected file.'));
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(file);
    });
    const comma = dataUrl.indexOf(',');
    const data = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
    return { mimeType: file.type || 'application/octet-stream', data };
  }

  /**
   * Convert an attached image/PDF into an editable draft brief. The result is
   * shown in the prompt box for the user to confirm/edit before running — the
   * downstream `AgentOrchestrator.run(text)` pipeline is untouched.
   */
  async briefFromFile(file: File, signal?: AbortSignal): Promise<string> {
    this.validateFile(file);
    const media = await this.fileToInlineData(file);
    return this.fromMedia(
      [{ text: INTAKE_INSTRUCTION }, { inlineData: media }],
      signal,
    );
  }

  /** Low-level: run a single multimodal generation and return its plain text. */
  async fromMedia(parts: Part[], signal?: AbortSignal): Promise<string> {
    const key = this.apiKeys.key();
    if (!key) throw new MissingApiKeyError();

    const sdk = await loadGenaiSdk();
    signal?.throwIfAborted();
    const ai = new sdk.GoogleGenAI({ apiKey: key });
    const response = await ai.models.generateContent({
      model: this.apiKeys.model(),
      contents: [{ role: 'user', parts }],
      config: { abortSignal: signal },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error('The document could not be interpreted into a brief.');
    }
    return text;
  }
}
