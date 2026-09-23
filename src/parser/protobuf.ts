/**
 * Schema-less Protocol Buffers reader. Decodes one message level into
 * `tag → values[]`; nested messages stay as bytes until asked for.
 */

export type ProtoValue =
  | { wire: 0; value: number; lo: number } // varint (+ low 32 bits for int32)
  | { wire: 1; bytes: Uint8Array } // fixed64
  | { wire: 2; bytes: Uint8Array } // length-delimited
  | { wire: 5; bytes: Uint8Array } // fixed32

export class ProtoMessage {
  private fields = new Map<number, ProtoValue[]>()

  constructor(buf: Uint8Array) {
    let pos = 0
    let lo = 0
    const varint = (): number => {
      let result = 0
      let mul = 1
      lo = 0
      for (let i = 0; i < 10; i++) {
        if (pos >= buf.length) throw new Error('protobuf: truncated varint')
        const b = buf[pos++]
        result += (b & 0x7f) * mul
        if (i < 5) lo |= (b & 0x7f) << (7 * i)
        if (!(b & 0x80)) return result
        mul *= 128
      }
      throw new Error('protobuf: varint too long')
    }
    const take = (n: number) => {
      if (pos + n > buf.length) throw new Error('protobuf: truncated field')
      const v = buf.subarray(pos, pos + n)
      pos += n
      return v
    }

    while (pos < buf.length) {
      const key = varint()
      const tag = Math.floor(key / 8)
      const wire = key % 8
      let v: ProtoValue
      switch (wire) {
        case 0:
          v = { wire: 0, value: varint(), lo }
          break
        case 1:
          v = { wire: 1, bytes: take(8) }
          break
        case 2:
          v = { wire: 2, bytes: take(varint()) }
          break
        case 5:
          v = { wire: 5, bytes: take(4) }
          break
        default:
          throw new Error(`protobuf: unsupported wire type ${wire}`)
      }
      const list = this.fields.get(tag)
      if (list) list.push(v)
      else this.fields.set(tag, [v])
    }
  }

  private last(tag: number): ProtoValue | undefined {
    const list = this.fields.get(tag)
    return list?.[list.length - 1]
  }

  has(tag: number): boolean {
    return this.fields.has(tag)
  }

  uint(tag: number, fallback = 0): number {
    const v = this.last(tag)
    return v?.wire === 0 ? v.value : fallback
  }

  optUint(tag: number): number | null {
    const v = this.last(tag)
    return v?.wire === 0 ? v.value : null
  }

  /** int32 encoded as plain (non-zigzag) varint; negatives are sign-extended. */
  int32(tag: number, fallback = 0): number {
    const v = this.last(tag)
    return v?.wire === 0 ? v.lo | 0 : fallback
  }

  float(tag: number): number | null {
    const v = this.last(tag)
    if (v?.wire !== 5) return null
    return new DataView(v.bytes.buffer, v.bytes.byteOffset, 4).getFloat32(0, true)
  }

  string(tag: number): string | null {
    const v = this.last(tag)
    return v?.wire === 2 ? new TextDecoder().decode(v.bytes) : null
  }

  message(tag: number): ProtoMessage | null {
    const v = this.last(tag)
    return v?.wire === 2 ? new ProtoMessage(v.bytes) : null
  }

  messages(tag: number): ProtoMessage[] {
    return (this.fields.get(tag) ?? []).flatMap((v) => (v.wire === 2 ? [new ProtoMessage(v.bytes)] : []))
  }
}
