/**
 * Browser-only: shrink a photo before upload. Phone cameras produce 3–8 MB
 * JPEGs; the model needs far less, and a small upload is faster on mobile data
 * and stays under the server's limit. On any failure the original is kept (the
 * server still enforces its own size limit and says so).
 */
const FOOD_SIDE = 1280;
const FOOD_QUALITY = 0.82;

export async function shrinkImage(
  file: File,
  { maxSide = FOOD_SIDE, quality = FOOD_QUALITY } = {},
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
