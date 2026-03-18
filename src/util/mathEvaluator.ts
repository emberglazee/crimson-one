export async function evaluateMathWorker(
    expression: string,
    timeoutMs: number = 2000
): Promise<string> {
    return new Promise((resolve, reject) => {
        // Run the math worker in a separate thread with NO environment variables
        // This ensures math.js exploit payloads cannot read process.env
        const worker = new Worker(
            new URL('../workers/mathWorker.ts', import.meta.url).href,
            { env: {} }
        )

        const timer = setTimeout(() => {
            worker.terminate()
            reject(new Error('Math evaluation timed out'))
        }, timeoutMs)

        worker.onmessage = (event: MessageEvent) => {
            clearTimeout(timer)
            worker.terminate() // Clean up worker
            const data = event.data
            if (data.success) {
                resolve(data.result)
            } else {
                reject(new Error(data.error))
            }
        }

        worker.onerror = error => {
            clearTimeout(timer)
            worker.terminate()
            reject(new Error(error.message))
        }

        worker.postMessage(expression)
    })
}
