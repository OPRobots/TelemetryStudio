import { eventBus } from './event-bus';
import { telemetryStore } from './telemetry-store';
import type { SessionFile, SessionWidget } from './types/session';
import type { WidgetCompatibilityResult } from './types/comparison';
import { sessionToDataset } from './session-codec';

/**
 * Gestor de comparación side-by-side.
 * Valida que widgets sean idénticos antes de activar.
 */
export class ComparisonManager {
  private active = false;
  private referenceSession: SessionFile | null = null;

  startComparison(
    reference: SessionFile,
    currentWidgets: SessionWidget[]
  ): WidgetCompatibilityResult {
    if (this.active) {
      return {
        compatible: false,
        differences: ['Ya hay una comparación activa; ciérrala antes de iniciar otra.'],
        sessionAWidgets: reference.layout.widgets,
        sessionBWidgets: currentWidgets,
      };
    }

    const result = this.validateWidgetCompatibility(
      reference.layout.widgets,
      currentWidgets
    );

    if (!result.compatible) {
      eventBus.emit('comparison:widget-mismatch', {
        differences: result.differences,
      });
      return result;
    }

    const referenceDataset = sessionToDataset(reference);
    telemetryStore.loadComparisonDataset(referenceDataset);

    this.referenceSession = reference;
    this.active = true;

    eventBus.emit('comparison:start', {
      referenceSession: reference,
      referenceDataset,
    });

    return result;
  }

  stopComparison(): void {
    // `clearComparison()` ya emite `comparison:stop`.
    telemetryStore.clearComparison();
    this.referenceSession = null;
    this.active = false;
  }

  validateWidgetCompatibility(
    widgetsA: SessionWidget[],
    widgetsB: SessionWidget[]
  ): WidgetCompatibilityResult {
    const differences: string[] = [];

    if (widgetsA.length !== widgetsB.length) {
      differences.push(
        `Número de widgets diferente: sesión A tiene ${widgetsA.length}, sesión B tiene ${widgetsB.length}`
      );
    }

    const maxLen = Math.max(widgetsA.length, widgetsB.length);
    for (let i = 0; i < maxLen; i++) {
      const wA = widgetsA[i];
      const wB = widgetsB[i];

      if (!wA || !wB) {
        differences.push(`Widget #${i + 1}: existe en una sesión pero no en la otra`);
        continue;
      }

      if (wA.t !== wB.t) {
        differences.push(`Widget #${i + 1}: tipo diferente ("${wA.t}" vs "${wB.t}")`);
      }

      if (JSON.stringify(wA.fields) !== JSON.stringify(wB.fields)) {
        differences.push(
          `Widget #${i + 1}: campos diferentes (${wA.fields.join(', ')} vs ${wB.fields.join(', ')})`
        );
      }

      if (JSON.stringify(wA.size) !== JSON.stringify(wB.size)) {
        differences.push(
          `Widget #${i + 1}: tamaño diferente ([${wA.size}] vs [${wB.size}])`
        );
      }

      if (JSON.stringify(wA.config) !== JSON.stringify(wB.config)) {
        differences.push(`Widget #${i + 1}: configuración diferente`);
      }
    }

    return {
      compatible: differences.length === 0,
      differences,
      sessionAWidgets: widgetsA,
      sessionBWidgets: widgetsB,
    };
  }

  get isActive(): boolean {
    return this.active;
  }

  get currentReference(): SessionFile | null {
    return this.referenceSession;
  }
}

/** Singleton global del ComparisonManager */
export const comparisonManager = new ComparisonManager();
