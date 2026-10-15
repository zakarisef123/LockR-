/* Compression des photos avant enregistrement.
   Une photo de smartphone pèse 3 à 8 Mo : stockée telle quelle, elle dépasse
   la limite de 1 Mo par document Firestore et la mise à jour (mission, annonce,
   profil…) échouait sans prévenir. Ici : redimensionnement + JPEG ≈ 100–300 Ko. */
export function compressImage(file, { maxSize = 1280, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    if (file.type && !file.type.startsWith("image/")) { reject(new Error("not_image")); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSize / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
        const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad_image")); };
    img.src = url;
  });
}

/* Lit un fichier image depuis un <input type="file"> et renvoie une version
   compressée ; affiche un message clair si le format n'est pas lisible. */
export async function readImageInput(e, opts) {
  const f = e?.target?.files?.[0];
  if (e?.target) e.target.value = ""; // permet de re-sélectionner le même fichier
  if (!f) return null;
  try {
    return await compressImage(f, opts);
  } catch {
    alert("Image illisible. Utilisez une photo au format JPEG ou PNG.");
    return null;
  }
}
