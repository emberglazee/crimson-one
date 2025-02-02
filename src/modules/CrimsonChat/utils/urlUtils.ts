export function normalizeUrl(url: string): string {
    try {
        const urlObj = new URL(url)
        if (urlObj.hostname === 'cdn.discordapp.com' || urlObj.hostname === 'media.discordapp.net') {
            return url // Preserve query parameters for Discord CDN URLs
        }
        return urlObj.protocol + '//' + urlObj.host + urlObj.pathname
    } catch {
        return url
    }
}

export function cleanImageUrl(url: string): string {
    try {
        const urlMatch = url.match(/https?:\/\/[^\s"]+?\.(?:gif|png|jpe?g|webp)(?:\?[^"\s}]+)?/i)
        if (!urlMatch) return url

        const extractedUrl = urlMatch[0]
        const urlObj = new URL(extractedUrl)
        
        if (urlObj.hostname === 'cdn.discordapp.com' || urlObj.hostname === 'media.discordapp.net') {
            return extractedUrl
        }

        return urlObj.protocol + '//' + urlObj.host + urlObj.pathname
    } catch {
        return url
    }
}
