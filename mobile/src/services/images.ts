/** 图片路径：存应用私有目录，数据库只记相对路径（spec：三端互通靠相对路径）。 */
export const PHOTO_DIR = 'images/photo';
export const CROP_DIR = 'images/crop';
export const DRAFT_KEY = 'busscard.entryDraft.v1';

export function photoName(stampMs: number, rand: string, ext = '.jpg'): string {
  return `${PHOTO_DIR}/${stampMs}_${rand}${ext}`;
}

export function cropName(stampMs: number, rand: string, index: number): string {
  return `${CROP_DIR}/${stampMs}_${rand}_${index}.jpg`;
}

export function fileNameOf(relPath: string): string {
  const parts = (relPath ?? '').split('/');
  return parts[parts.length - 1] ?? '';
}
