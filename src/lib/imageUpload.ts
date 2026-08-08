/** Compress an image file to a JPEG data URL for product photos (no storage bucket needed). */
export async function fileToProductImage(file: File, maxSide = 800, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file')
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  // Keep under ~450KB for localStorage / row size comfort
  if (dataUrl.length > 600_000) {
    return canvas.toDataURL('image/jpeg', 0.55)
  }
  return dataUrl
}
