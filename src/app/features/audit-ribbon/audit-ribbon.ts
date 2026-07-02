import { Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AgentOrchestrator } from '../../core/ai/agent-orchestrator.service';
import { toAppError } from '../../core/errors/app-error';
import { NotificationService } from '../../core/errors/notification.service';
import { AgentStore } from '../../core/state/agent.store';
import {
  AuditIssue,
  MissingApiKeyError,
  SPECIALIST_IDS,
  SPECIALIST_META,
  SpecialistId,
} from '../../core/types/agent.types';

@Component({
  selector: 'dea-audit-ribbon',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './audit-ribbon.html',
  styleUrl: './audit-ribbon.scss',
})
export class AuditRibbon {
  private readonly store = inject(AgentStore);
  private readonly orchestrator = inject(AgentOrchestrator);
  private readonly notifications = inject(NotificationService);

  protected readonly auditorStatus = computed(
    () => this.store.agentStates().auditor.status,
  );
  protected readonly auditSummary = this.store.auditSummary;
  protected readonly auditIssues = this.store.auditIssues;

  protected readonly isAuditorRunning = computed(() => {
    const s = this.auditorStatus();
    return s === 'pending' || s === 'thinking' || s === 'streaming';
  });

  protected readonly isAuditorErrored = computed(
    () => this.auditorStatus() === 'error',
  );

  protected readonly auditorError = computed(
    () => this.store.agentStates().auditor.error ?? null,
  );

  protected readonly isAuditorDone = computed(
    () => this.auditorStatus() === 'done',
  );

  protected readonly hasIssues = computed(() => this.auditIssues().length > 0);

  protected readonly isClean = computed(
    () => this.isAuditorDone() && !this.hasIssues(),
  );

  protected readonly specialistsRunning = computed(() =>
    SPECIALIST_IDS.some((id) => {
      const s = this.store.agentStates()[id].status;
      return s === 'pending' || s === 'thinking' || s === 'streaming';
    }),
  );

  protected readonly awaitingAudit = computed(
    () =>
      this.auditorStatus() === 'idle' &&
      this.store.hasContent() &&
      !this.specialistsRunning(),
  );

  protected iconFor(targetId: SpecialistId): string {
    return SPECIALIST_META[targetId].icon;
  }

  protected isTargetBusy(targetId: SpecialistId): boolean {
    const s = this.store.agentStates()[targetId].status;
    return s === 'pending' || s === 'thinking' || s === 'streaming';
  }

  protected canApply(issue: AuditIssue): boolean {
    return !this.isAuditorRunning() && !this.isTargetBusy(issue.targetId);
  }

  protected async applyFix(issue: AuditIssue): Promise<void> {
    if (!this.canApply(issue)) return;
    try {
      await this.orchestrator.applyFixIt(issue);
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    }
  }

  protected dismiss(issue: AuditIssue): void {
    this.store.dismissAuditIssue(issue.id);
  }

  protected async reAudit(): Promise<void> {
    if (this.isAuditorRunning()) return;
    try {
      await this.orchestrator.reAudit();
    } catch (err) {
      if (err instanceof MissingApiKeyError) {
        this.notifications.warn('Please connect a Gemini API key first.');
        return;
      }
      this.notifications.errorFrom(toAppError(err));
    }
  }
}
