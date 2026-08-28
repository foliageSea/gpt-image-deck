import type { ImageDeckApi } from '../shared/image-types'

declare global {
  interface Window {
    imageDeck: ImageDeckApi
  }
}
