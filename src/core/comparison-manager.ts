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
  private sharedVerticalBar = true;

  startComparison(
    reference: SessionFile,
    currentWidgets: SessionWidget[]
  ): WidgetCompatibilityResult {
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
    telemetryStore.clearComparison();
    this.referenceSession = null;
    this.active = false;

    eventBus.emit('comparison:stop', {});
  }

  setSyncBarMode(shared: boolean): void {
    this.sharedVerticalBar = shared;
    eventBus.emit('comparison:sync-mode-change', { sharedBar: shared });
  }

  private validateWidgetCompatibility(
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

      if (JSON.stringify(wA.pos) !== JSON.stringify(wB.pos)) {
        differences.push(
          `Widget #${i + 1}: posición diferente ([${wA.pos}] vs [${wB.pos}])`
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

  get isSharedBar(): boolean {
    return this.sharedVerticalBar;
  }

  get currentReference(): SessionFile | null {
    return this.referenceSession;
  }
}

/** Singleton global del ComparisonManager */
export const comparisonManager = new ComparisonManager();
