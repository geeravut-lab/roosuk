/**
 * Browser-only: shrink a photo before upload. Phone cameras produce 3–8 MB
 * JPEGs; the model needs far less, and a small upload is faster on mobile data
 * and stays under the server's limit. On any failure the original is kept (the
 * server still enforces its own size limit and says so).
 */
const MAX_SIDE = 1280;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "meal.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
