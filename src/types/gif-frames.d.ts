declare module 'gif-frames' {
    interface Options {
        url: string | ArrayBuffer;
        frames: 'all' | number;
        outputType?: string;
        cumulative?: boolean;
    }

    interface Frame {
        getImage(): {
            _obj: string | Buffer;
        };
    }

    function gifFrames(options: Options): Promise<Frame[]>;
    export default gifFrames;
}