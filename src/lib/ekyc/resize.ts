/**
 * Browser-only: turn a camera picture into a small JPEG WITHOUT running the phone
 * out of memory (docs/SkillConnect_eKYC_Skill.md §5.2). A phone photo is 10–50 MB
 * once decoded; decoding it in full made Android reload the tab with no error.
 * The rules: let the decoder shrink while it decodes (`createImageBitmap` with a
 * resize), draw once, release the canvas and the bitmap at once, and let the caller
 * drop the original File. Selfie first, document second, so two heavy pictures are
 * never alive together.
 */

/** Largest size that keeps the shape and fits inside max × max (never enlarges). */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const r = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * r)),
    height: Math.max(1, Math.round(height * r)),
  };
}

function encode(
  source: CanvasImageSource,
  width: number,
  height: number,
  max: number,
  quality: number,
): Promise<Blob> {
  const size = fitWithin(width, height, max);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas
    .getContext("2d", { alpha: false })!
    .drawImage(source, 0, 0, size.width, size.height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        // give the memory back right away
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error("encode failed"));
      },
      "image/jpeg",
      quality,
    );
  });
}

/** A picked/captured file → a JPEG File no larger than `max` pixels on its long side. */
export async function fileToJpeg(
  file: Blob,
  max: number,
  quality: number,
): Promise<File> {
  if (typeof createImageBitmap === "function") {
    try {
      let bitmap: ImageBitmap;
      try {
        // one dimension only: the browser keeps the shape; the decoder never holds the full picture
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
          resizeWidth: max,
          resizeQuality: "medium",
        });
      } catch {
        bitmap = await createImageBitmap(file, {
          imageOrientation: "from-image",
        });
      }
      try {
        const blob = await encode(
          bitmap,
          bitmap.width,
          bitmap.height,
          max,
          quality,
        );
        return new File([blob], "photo.jpg", { type: "image/jpeg" });
      } finally {
        bitmap.close();
      }
    } catch {
      /* fall through to the older path */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image load failed"));
      el.src = url;
    });
    const blob = await encode(
      img,
      img.naturalWidth,
      img.naturalHeight,
      max,
      quality,
    );
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A frame of a playing <video> → JPEG (the live selfie). */
export async function videoFrameToJpeg(
  video: HTMLVideoElement,
  max: number,
  quality: number,
): Promise<File> {
  const blob = await encode(
    video,
    video.videoWidth,
    video.videoHeight,
    max,
    quality,
  );
  return new File([blob], "selfie.jpg", { type: "image/jpeg" });
}
