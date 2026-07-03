import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
  });

  it('defaults autoHeal to on when nothing is persisted', () => {
    const service = TestBed.inject(SettingsService);
    expect(service.autoHeal()).toBe(true);
  });

  it('persists autoHeal changes to localStorage', () => {
    const service = TestBed.inject(SettingsService);
    service.setAutoHeal(false);
    expect(service.autoHeal()).toBe(false);
    expect(localStorage.getItem('dea.autoHeal')).toBe('false');
  });

  it('toggleAutoHeal flips the current value', () => {
    const service = TestBed.inject(SettingsService);
    const before = service.autoHeal();
    service.toggleAutoHeal();
    expect(service.autoHeal()).toBe(!before);
  });

  it('reads a persisted "off" value on construction', () => {
    localStorage.setItem('dea.autoHeal', 'false');
    const service = TestBed.inject(SettingsService);
    expect(service.autoHeal()).toBe(false);
  });
});
