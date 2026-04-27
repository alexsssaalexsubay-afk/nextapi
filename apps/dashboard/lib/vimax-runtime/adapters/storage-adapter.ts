import { listLibraryAssets, uploadLibraryImage, type LibraryAsset } from "@/lib/workflows"

export async function listReusableReferenceImages(): Promise<LibraryAsset[]> {
  return listLibraryAssets("image")
}

export async function storeReferenceImage(file: File): Promise<LibraryAsset> {
  return uploadLibraryImage(file)
}
