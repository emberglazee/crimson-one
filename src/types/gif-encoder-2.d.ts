declare module 'gif-encoder-2' {
    export default class GIFEncoder {
        constructor(width: number, height: number);
        start(): void;
        setDelay(ms: number): void;
        setQuality(quality: number): void;
        setRepeat(repeat: number): void;
        addFrame(context: CanvasRenderingContext2D): void;
        finish(): void;
        out: { getData: () => Buffer };
    }
}