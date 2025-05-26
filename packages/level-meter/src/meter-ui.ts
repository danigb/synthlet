export type LevelMeterUIOptions = {
  minDb: number;
  maxDb: number;
  // For now only horizontal is supported
  orientation: "horizontal";
};

export class LevelMeterUI {
  canvas: HTMLCanvasElement | null = null;
  context: CanvasRenderingContext2D | null = null;
  width: number = 0;
  height: number = 0;
  minDb: number;
  maxDb: number;
  gradient?: CanvasGradient | null = null;
  stripes?: CanvasPattern | null = null;

  constructor(options: Partial<LevelMeterUIOptions> = {}) {
    this.minDb = options.minDb ?? -40;
    this.maxDb = options.maxDb ?? 0;
  }

  setCanvas(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
  }

  render(data: Float32Array, channels: number) {
    if (!this.canvas || !this.context) {
      return;
    }
    if (!this.gradient) {
      this.gradient = this.createMeterGradient(this.context);
      this.stripes = this.createStipesPattern(this.context);
    }

    const barHeight = this.height / channels - 2;
    this.context.clearRect(0, 0, this.width, this.height);

    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.fillStyle = this.gradient || "black";
    for (let i = 0; i < channels; i++) {
      const peak = data[i];
      const db = 20 * Math.log10(peak);
      const limitDb = db < this.minDb ? this.minDb : db;
      const normalizedDb = (limitDb - this.minDb) / (this.maxDb - this.minDb);
      const barWidth = Math.max(0, Math.min(1, normalizedDb)) * this.width;
      this.context.fillRect(0, i * barHeight + 0.5, barWidth, barHeight - 0.5);
    }
    if (this.stripes) {
      this.context.fillStyle = this.stripes;
      this.context.fillRect(0, 0, this.width, this.height);
    }
  }

  private createMeterGradient(ctx: CanvasRenderingContext2D) {
    const gradient = ctx.createLinearGradient(0, 0, this.width, 0);

    const dbToPosition = (db: number) => {
      return (db - this.minDb) / (this.maxDb - this.minDb);
    };

    // Colors from reference
    const lowGain = "rgba(60,180,60)";
    const highGain = "rgb(220,220,0)";
    const clipGain = "rgb(160,16,0)";

    // Create smooth gradient transitions
    gradient.addColorStop(0.0, lowGain);
    gradient.addColorStop(dbToPosition(-18), lowGain);
    gradient.addColorStop(dbToPosition(-6), highGain);
    gradient.addColorStop(dbToPosition(-0), clipGain);
    gradient.addColorStop(1.0, clipGain);

    return gradient;
  }

  private createStipesPattern(ctx: CanvasRenderingContext2D) {
    const canvas = document.createElement("canvas");
    canvas.width = 3;
    canvas.height = 1;
    const context = canvas.getContext("2d");

    if (context) {
      context.fillStyle = "rgba(39, 39, 39, 0.9)";
      context.fillRect(0, 0, 1, 1);
    }
    return ctx.createPattern(canvas, "repeat");
  }
}
