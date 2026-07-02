import { createProgram, createTarget, drawFullscreen, type Target } from './gl';
import { defaultParams, type SparkleParams } from './params';
import { BASE_FRAG, BLIT_FRAG, DETAIL_FRAG, SPARKLE_FRAG, VERT_SRC } from './shaders';

export type ViewMode = 'effect' | 'base' | 'detail';

export class SparkleRenderer {
  private gl: WebGL2RenderingContext;
  private canvas: HTMLCanvasElement;
  private baseProgram: WebGLProgram;
  private detailProgram: WebGLProgram;
  private sparkleProgram: WebGLProgram;
  private blitProgram: WebGLProgram;
  private source: WebGLTexture | null = null;
  private sourceWidth = 0;
  private sourceHeight = 0;
  private base: Target | null = null;
  private detail: Target | null = null;
  private stateRead: Target | null = null;
  private stateWrite: Target | null = null;
  private frameIndex = 0;
  private params: SparkleParams = { ...defaultParams };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL2 is not supported in this browser.');
    this.gl = gl;
    this.baseProgram = createProgram(gl, VERT_SRC, BASE_FRAG);
    this.detailProgram = createProgram(gl, VERT_SRC, DETAIL_FRAG);
    this.sparkleProgram = createProgram(gl, VERT_SRC, SPARKLE_FRAG);
    this.blitProgram = createProgram(gl, VERT_SRC, BLIT_FRAG);
  }

  getParams(): SparkleParams {
    return { ...this.params };
  }

  setParams(partial: Partial<SparkleParams>): void {
    const sharpenChanged =
      partial.sharpen !== undefined && partial.sharpen !== this.params.sharpen;
    this.params = { ...this.params, ...partial };
    if (sharpenChanged && this.source) this.renderBase();
  }

  setImage(image: ImageBitmap): void {
    const gl = this.gl;
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    let bitmap = image;
    if (image.width > maxSize || image.height > maxSize) {
      const scale = Math.min(maxSize / image.width, maxSize / image.height);
      const w = Math.max(1, Math.floor(image.width * scale));
      const h = Math.max(1, Math.floor(image.height * scale));
      console.warn(
        `Image ${image.width}x${image.height} exceeds MAX_TEXTURE_SIZE ${maxSize}; downscaling to ${w}x${h}.`,
      );
      const off = new OffscreenCanvas(w, h);
      const ctx = off.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable for downscaling.');
      ctx.drawImage(image, 0, 0, w, h);
      bitmap = off.transferToImageBitmap();
    }
    if (this.source) gl.deleteTexture(this.source);
    const texture = gl.createTexture();
    if (!texture) throw new Error('Failed to create source texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // No UNPACK_FLIP_Y here: browsers ignore it for ImageBitmap. Shaders flip
    // the Y coordinate when sampling u_source instead.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.source = texture;
    this.sourceWidth = bitmap.width;
    this.sourceHeight = bitmap.height;
    this.rebuildTargets();
  }

  setSize(width: number, height: number): void {
    if (width === this.canvas.width && height === this.canvas.height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.source) this.rebuildTargets();
  }

  render(dt: number, mode: ViewMode, paused: boolean): void {
    const gl = this.gl;
    if (!this.source || !this.base || !this.detail || !this.stateRead || !this.stateWrite) {
      return;
    }
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (!paused) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.stateWrite.framebuffer);
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.sparkleProgram);
      this.bindTexture(this.sparkleProgram, 'u_prev', 0, this.stateRead.texture);
      this.bindTexture(this.sparkleProgram, 'u_base', 1, this.base.texture);
      this.bindTexture(this.sparkleProgram, 'u_detail', 2, this.detail.texture);
      this.bindTexture(this.sparkleProgram, 'u_source', 3, this.source);
      gl.uniform2f(
        this.loc(this.sparkleProgram, 'u_sourceSize'),
        this.sourceWidth,
        this.sourceHeight,
      );
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_dt'), dt);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_density'), this.params.density);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_halfLife'), this.params.halfLife);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_edgeInfluence'), this.params.edgeInfluence);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_edgeGamma'), this.params.edgeGamma);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_jitterRadius'), this.params.jitterRadius);
      gl.uniform1f(this.loc(this.sparkleProgram, 'u_sparkStrength'), this.params.sparkStrength);
      gl.uniform1ui(this.loc(this.sparkleProgram, 'u_frame'), this.frameIndex >>> 0);
      drawFullscreen(gl);
      const swap = this.stateRead;
      this.stateRead = this.stateWrite;
      this.stateWrite = swap;
      this.frameIndex++;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.blitProgram);
    this.bindTexture(this.blitProgram, 'u_state', 0, this.stateRead.texture);
    this.bindTexture(this.blitProgram, 'u_base', 1, this.base.texture);
    this.bindTexture(this.blitProgram, 'u_detail', 2, this.detail.texture);
    gl.uniform1f(this.loc(this.blitProgram, 'u_intensity'), this.params.intensity);
    gl.uniform1i(
      this.loc(this.blitProgram, 'u_mode'),
      mode === 'base' ? 1 : mode === 'detail' ? 2 : 0,
    );
    drawFullscreen(gl);
  }

  private loc(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    return this.gl.getUniformLocation(program, name);
  }

  private bindTexture(
    program: WebGLProgram,
    name: string,
    unit: number,
    texture: WebGLTexture,
  ): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(this.loc(program, name), unit);
  }

  private rebuildTargets(): void {
    const gl = this.gl;
    const w = Math.max(1, this.canvas.width);
    const h = Math.max(1, this.canvas.height);
    for (const target of [this.base, this.detail, this.stateRead, this.stateWrite]) {
      if (target) {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
      }
    }
    this.base = createTarget(gl, w, h);
    this.detail = createTarget(gl, w, h);
    this.stateRead = createTarget(gl, w, h);
    this.stateWrite = createTarget(gl, w, h);
    this.frameIndex = 0;
    this.renderBase();
    this.renderDetail();
    // Seed both state buffers so the first frames decay from the base image.
    this.renderBaseInto(this.stateRead);
    this.renderBaseInto(this.stateWrite);
  }

  private renderBase(): void {
    if (this.base) this.renderBaseInto(this.base);
  }

  private renderBaseInto(target: Target): void {
    const gl = this.gl;
    if (!this.source) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.baseProgram);
    this.bindTexture(this.baseProgram, 'u_source', 0, this.source);
    gl.uniform2f(this.loc(this.baseProgram, 'u_outputSize'), this.canvas.width, this.canvas.height);
    gl.uniform1f(this.loc(this.baseProgram, 'u_sharpen'), this.params.sharpen);
    drawFullscreen(gl);
  }

  private renderDetail(): void {
    const gl = this.gl;
    if (!this.detail || !this.source) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.detail.framebuffer);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.detailProgram);
    this.bindTexture(this.detailProgram, 'u_source', 0, this.source);
    gl.uniform2f(
      this.loc(this.detailProgram, 'u_sourceSize'),
      this.sourceWidth,
      this.sourceHeight,
    );
    drawFullscreen(gl);
  }
}
