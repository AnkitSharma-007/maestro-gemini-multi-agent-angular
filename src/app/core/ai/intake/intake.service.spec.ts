import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { IntakeService, IntakeValidationError, MAX_INTAKE_BYTES } from './intake.service';
import { ApiKeyService } from '../../auth/api-key.service';

// The Angular unit-test runner only allows vi.mock on non-relative (package)
// imports, so we mock the SDK package the lazy loader resolves to.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

function makeFile(type: string, size = 10, content = 'hello'): File {
  const file = new File([content], 'sample', { type });
  if (size !== content.length) {
    Object.defineProperty(file, 'size', { value: size });
  }
  return file;
}

describe('IntakeService', () => {
  let service: IntakeService;

  beforeEach(() => {
    generateContent.mockReset();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ApiKeyService,
          useValue: {
            key: signal('test-key'),
            model: () => 'gemini-3.5-flash',
          } as unknown as ApiKeyService,
        },
      ],
    });
    service = TestBed.inject(IntakeService);
  });

  describe('validateFile', () => {
    it('accepts images and PDFs', () => {
      expect(() => service.validateFile(makeFile('image/png'))).not.toThrow();
      expect(() => service.validateFile(makeFile('application/pdf'))).not.toThrow();
    });

    it('rejects unsupported types with a friendly error', () => {
      expect(() => service.validateFile(makeFile('text/csv'))).toThrow(IntakeValidationError);
    });

    it('rejects files over the size cap', () => {
      const tooBig = makeFile('image/png', MAX_INTAKE_BYTES + 1);
      expect(() => service.validateFile(tooBig)).toThrow(IntakeValidationError);
    });
  });

  describe('fileToInlineData', () => {
    it('strips the data URL prefix and keeps the mime type', async () => {
      const result = await service.fileToInlineData(makeFile('image/png', 5, 'hello'));
      expect(result.mimeType).toBe('image/png');
      // base64('hello') === 'aGVsbG8='
      expect(result.data).toBe('aGVsbG8=');
    });
  });

  describe('briefFromFile', () => {
    it('validates, sends a multimodal request, and returns trimmed text', async () => {
      generateContent.mockResolvedValue({ text: '  A 2-day summit in Berlin.  ' });
      const brief = await service.briefFromFile(makeFile('image/png'));
      expect(brief).toBe('A 2-day summit in Berlin.');
      expect(generateContent).toHaveBeenCalledTimes(1);
      const arg = generateContent.mock.calls[0][0];
      expect(arg.model).toBe('gemini-3.5-flash');
      expect(arg.contents[0].parts.some((p: { inlineData?: unknown }) => p.inlineData)).toBe(true);
    });

    it('throws when the model returns no usable text', async () => {
      generateContent.mockResolvedValue({ text: '   ' });
      await expect(service.briefFromFile(makeFile('image/png'))).rejects.toThrow();
    });
  });
});
