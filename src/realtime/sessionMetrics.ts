import { RealtimeEvent } from './event';

export interface RealtimeSessionMetrics {
  readonly framesProcessed: number;
  readonly binaryFrames: number;
  readonly malformedFrames: number;
  readonly maximumProcessingMicros: number;
  readonly p95ProcessingMicros: number;
}

export const EMPTY_SESSION_METRICS: RealtimeSessionMetrics = {
  framesProcessed: 0,
  binaryFrames: 0,
  malformedFrames: 0,
  maximumProcessingMicros: 0,
  p95ProcessingMicros: 0,
};

const MAXIMUM_SAMPLES = 256;

export class RealtimeSessionMetricsCollector {
  private framesProcessed = 0;
  private binaryFrames = 0;
  private malformedFrames = 0;
  private maximumProcessingMicros = 0;
  private readonly processingSamples: number[] = [];

  snapshot(): RealtimeSessionMetrics {
    const sorted = [...this.processingSamples].sort((a, b) => a - b);
    const p95 =
      sorted.length === 0
        ? 0
        : sorted[Math.ceil((sorted.length - 1) * 0.95)];
    return {
      framesProcessed: this.framesProcessed,
      binaryFrames: this.binaryFrames,
      malformedFrames: this.malformedFrames,
      maximumProcessingMicros: this.maximumProcessingMicros,
      p95ProcessingMicros: p95,
    };
  }

  record(event: RealtimeEvent, processingMicros: number): void {
    this.framesProcessed += 1;
    if (event.kind === 'binary') {
      this.binaryFrames += 1;
    } else if (event.kind === 'malformed') {
      this.malformedFrames += 1;
    }
    if (processingMicros > this.maximumProcessingMicros) {
      this.maximumProcessingMicros = processingMicros;
    }
    this.processingSamples.push(processingMicros);
    if (this.processingSamples.length > MAXIMUM_SAMPLES) {
      this.processingSamples.shift();
    }
  }
}
