import { Client } from '@gradio/client'
import { Logger } from '../util/logger'
const logger = Logger.new('Vision')

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
        logger.info('Initializing Gradio client')
        this.GradioClient = await Client.connect('KingNish/Qwen2-VL-7B')
        logger.ok('Gradio client initialized')
    }
    public async captionImage(imageUrl: string): Promise<string> {
        if (!this.GradioClient) {
            throw new Error('Gradio client not initialized')
        }
        logger.info('Fetching image')
        const image = await (await fetch(imageUrl)).blob()
        logger.info('Predicting image caption')
        const response = await this.GradioClient.predict('/qwen_inference', {
            media_input: image,
            text_input: 'Describe this image in detail'
        }).catch(err => {
            logger.error(`Failed to predict image caption\n${err}`)
            throw err
        })
        logger.ok(`Image caption predicted: ${response.data}`)
        return response.data as string
    }
}
