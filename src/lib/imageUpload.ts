/** Compress + upload product photos to free Supabase Storage (with data-URL fallback). */
import { supabase, isSupabaseConfigured } from './supabase'

async function compressToBlob(file: File, maxSide = 1000, quality = 0.78): Promise<Blob> {
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
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
  )
  if (!blob) throw new Error('Could not compress image')
  return blob
}

/** @deprecated Prefer uploadProductImage — kept for offline/dev fallback */
export async function fileToProductImage(file: File, maxSide = 800, quality = 0.72): Promise<string> {
  const blob = await compressToBlob(file, maxSide, quality)
  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

/** Upload to public `product-images` bucket; falls back to data URL if storage blocked. */
export async function uploadProductImage(file: File, productKey = 'new'): Promise<string> {
  const blob = await compressToBlob(file)
  if (!isSupabaseConfigured || !supabase) {
    return fileToProductImage(file)
  }

  const path = `${productKey}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('product-images').upload(path, blob, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  if (error) {
    console.warn('Storage upload failed, using compressed data URL:', error.message)
    return fileToProductImage(file)
  }

  const { data } = supabase.storage.from('product-images').getPublicUrl(path)
  return data.publicUrl
}
