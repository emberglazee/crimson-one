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
        this.GradioClient = await Client.connect('1aurent/cogvlm_captionner')
        logger.ok('Gradio client initialized')
    }
    public async captionImage(imageUrl: string): Promise<string> {
        if (!this.GradioClient) {
            throw new Error('Gradio client not initialized')
        }
        logger.info('Fetching image')
        const image = await (await fetch(imageUrl)).blob()
        logger.info('Predicting image caption')
        const response = await this.GradioClient.predict('/generate_caption', {
            image,
            query: 'Provide a factual description of this image in up to two paragraphs. Include details on objects, background, scenery, interactions, gestures, poses, and any visible text content. Specify the number of repeated objects. Describe the dominant colors, color contrasts, textures, and materials. Mention the composition, including the arrangement of elements and focus points. Note the camera angle or perspective, and provide any identifiable contextual information. Include details on the style, lighting, and shadows. Avoid subjective interpretations or speculation.'
        }).catch(err => {
            logger.error('Failed to predict image caption')
            console.log(err)
            throw err
        })
        logger.ok(`Image caption predicted: ${response.data}`)
        return response.data as string
    }
}
