/** Lado del avatar guardado: de sobra para la foto de 96 px del perfil y los 34 px del riel, incluso en pantallas 3x. */
export const AVATAR_SIDE = 512;

/** Tipos que acepta el servidor (`ProfilePhotoInvalidType`). */
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Tamaño máximo del archivo ya procesado que acepta el servidor. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Prepara la foto para subirla: recorte cuadrado centrado y reducción a `AVATAR_SIDE` px, en WebP (o JPEG si el
 * navegador no codifica WebP). Una foto de celular de varios MB queda en decenas de KB y nunca pasa del tope del servidor.
 * Respeta la orientación EXIF. Si el navegador no puede decodificarla (o no hay canvas, como en jsdom) devuelve el
 * archivo original y que decida el servidor.
 */
export async function squareAvatar(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIDE;
    canvas.height = AVATAR_SIDE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (blob && blob.type === type) return new File([blob], type === "image/webp" ? "avatar.webp" : "avatar.jpg", { type });
    }
    return file;
  } finally {
    bitmap.close();
  }
}
