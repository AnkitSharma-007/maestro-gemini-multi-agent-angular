import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CommandCenter } from './command-center';
import { IntakeService, IntakeValidationError } from '../../core/ai/intake/intake.service';
import { NotificationService } from '../../core/errors/notification.service';

function fileEvent(file: File): Event {
  const input = document.createElement('input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  return { target: input } as unknown as Event;
}

describe('CommandCenter intake', () => {
  const briefFromFile = vi.fn();
  const notify = {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    errorFrom: vi.fn(),
  };

  beforeEach(async () => {
    briefFromFile.mockReset();
    Object.values(notify).forEach((fn) => fn.mockReset());
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [CommandCenter],
      providers: [
        { provide: IntakeService, useValue: { briefFromFile } },
        { provide: NotificationService, useValue: notify },
      ],
    }).compileComponents();
  });

  it('fills the prompt with the interpreted brief on success', async () => {
    briefFromFile.mockResolvedValue('A 2-day founders retreat in Bali.');
    const comp = TestBed.createComponent(CommandCenter).componentInstance as unknown as {
      onFileSelected(e: Event): Promise<void>;
      prompt: () => string;
    };

    await comp.onFileSelected(fileEvent(new File(['x'], 'agenda.png', { type: 'image/png' })));

    expect(briefFromFile).toHaveBeenCalledTimes(1);
    expect(comp.prompt()).toBe('A 2-day founders retreat in Bali.');
  });

  it('shows a friendly error and leaves the prompt empty on validation failure', async () => {
    briefFromFile.mockRejectedValue(new IntakeValidationError('Unsupported file.'));
    const comp = TestBed.createComponent(CommandCenter).componentInstance as unknown as {
      onFileSelected(e: Event): Promise<void>;
      prompt: () => string;
    };

    await comp.onFileSelected(fileEvent(new File(['x'], 'data.csv', { type: 'text/csv' })));

    expect(notify.error).toHaveBeenCalledWith('Unsupported file.');
    expect(comp.prompt()).toBe('');
  });
});
