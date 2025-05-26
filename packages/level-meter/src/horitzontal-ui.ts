export class HorizontalUI {
  canvas: HTMLCanvasElement | null = null;
  context: CanvasRenderingContext2D | null = null;
  width: number = 0;
  height: number = 0;

  MIN_DB = -40;
  MAX_DB = 0;

  constructor() {}

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

    this.context.clearRect(0, 0, this.width, this.height);

    this.context.fillStyle = "black";
    this.context.fillRect(0, 0, this.width, this.height);

    const barHeight = this.height / channels - 2;

    this.context.fillStyle = "green";
    for (let i = 0; i < channels; i++) {
      const peak = data[i];
      const db = 20 * Math.log10(peak);
      const limitDb = db < this.MIN_DB ? this.MIN_DB : db;
      const normalizedDb =
        (limitDb - this.MIN_DB) / (this.MAX_DB - this.MIN_DB);
      const barWidth = Math.max(0, Math.min(1, normalizedDb)) * this.width;
      this.context.fillRect(0, this.height - barHeight, barWidth, barHeight);
    }
  }
}
