declare module 'libheif-js/wasm-bundle' {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(target: ImageData, callback: (result: ImageData | null) => void): void;
  }
  export interface HeifDecoderConstructor {
    new (): { decode(buffer: ArrayBuffer | Uint8Array): HeifImage[] };
  }
  const libheif: { HeifDecoder: HeifDecoderConstructor };
  export default libheif;
}
