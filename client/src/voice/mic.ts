// Opens the microphone only to drive the audio-level visual (and to request permission up front).
export class MicMeter {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private raf = 0;

  async start(onLevel: (level: number) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException("Media devices unavailable", "NotSupportedError");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    this.stream = stream;
    const ctx = new AudioContext();
    this.ctx = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const d = (buf[i] - 128) / 128;
        sum += d * d;
      }
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.stream = null;
    this.ctx = null;
  }
}