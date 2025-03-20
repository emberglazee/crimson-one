declare module "morse" {
    /**
     * Encodes a string into Morse code.
     * @param obj The string to encode.
     * @returns The encoded Morse code as a string.
     */
    function encode(obj: string): string;

    /**
     * Encodes an array of strings into Morse code.
     * @param obj The array of strings to encode.
     * @returns An array of encoded Morse code strings.
     */
    function encode(obj: string[]): string[];

    /**
     * Decodes a Morse code string back into text.
     * @param obj The Morse code string to decode.
     * @param dichotomic Whether to use dichotomic tree-based decoding.
     * @returns The decoded text as a string.
     */
    function decode(obj: string, dichotomic?: boolean): string;

    /**
     * Decodes an array of Morse code strings back into text.
     * @param obj The array of Morse code strings to decode.
     * @param dichotomic Whether to use dichotomic tree-based decoding.
     * @returns An array of decoded text strings.
     */
    function decode(obj: string[], dichotomic?: boolean): string[];

    /**
     * A mapping of characters to their Morse code representations.
     */
    const map: Readonly<Record<string, string>>;

    /**
     * Represents a node in the Morse code tree used for dichotomic decoding.
     */
    interface MorseTreeNode {
        stop?: string;
        ".": MorseTreeNode;
        "-": MorseTreeNode;
    }

    /**
     * The root of the Morse code tree used for decoding.
     */
    const tree: Readonly<MorseTreeNode>;

    export { encode, decode, map, tree };
}
