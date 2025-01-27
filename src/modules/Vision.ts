import { Client } from '@gradio/client'

export default class Vision {
    private static instance: Vision
    private GradioClient: Client | null = null

    public static getInstance(): Vision {
        if (!Vision.instance) {
            Vision.instance = new Vision()
        }
        return Vision.instance
    }
    public async init() {
        this.GradioClient = await Client.connect('KingNish/Qwen2-VL-7B')
    }
    public async captionImage(imageUrl: string): Promise<string> {
        if (!this.GradioClient) {
            throw new Error('Gradio client not initialized')
        }
        const image = await (await fetch(imageUrl)).blob()
        const response = await this.GradioClient.predict('/qwen_inference', {
            media_input: image,
            text_input: 'Describe this image in detail'
        })
        return response.data as string
    }
}
