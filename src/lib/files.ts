export const isReplay = (name: string) => name.toLowerCase().endsWith('.wotbreplay')

/** Collect files from a drop, descending into dropped folders. */
export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...dt.files]
  const out: File[] = []
  await Promise.all(entries.map((e) => walk(e, out)))
  return out
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    out.push(await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej)))
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
    if (!batch.length) break
    await Promise.all(batch.map((e) => walk(e, out)))
  }
}
