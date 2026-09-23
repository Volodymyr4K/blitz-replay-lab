/**
 * Minimal Python pickle reader — just enough for `battle_results.dat`,
 * which is a pickled 2-tuple `(arena_unique_id: int, protobuf: bytes)`.
 *
 * Supports protocols 0–5 opcodes that WoT Blitz (and similar Python 2/3 writers)
 * emit for ints, byte strings, tuples and memoization. Anything else throws.
 */

export type PickleValue = bigint | number | Uint8Array | string | boolean | null | PickleValue[]

const MARK = Symbol('mark')
type StackItem = PickleValue | typeof MARK

export function unpickle(data: Uint8Array): PickleValue {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const stack: StackItem[] = []
  const memo = new Map<number, PickleValue>()
  let pos = 0

  const need = (n: number) => {
    if (pos + n > data.length) throw new Error('pickle: unexpected end of data')
  }
  const u8 = () => {
    need(1)
    return data[pos++]
  }
  const u16 = () => {
    need(2)
    const v = view.getUint16(pos, true)
    pos += 2
    return v
  }
  const u32 = () => {
    need(4)
    const v = view.getUint32(pos, true)
    pos += 4
    return v
  }
  const i32 = () => {
    need(4)
    const v = view.getInt32(pos, true)
    pos += 4
    return v
  }
  const bytes = (n: number) => {
    need(n)
    const v = data.subarray(pos, pos + n)
    pos += n
    return v
  }
  const line = () => {
    const end = data.indexOf(0x0a, pos)
    if (end < 0) throw new Error('pickle: unterminated line')
    const s = new TextDecoder('latin1').decode(data.subarray(pos, end))
    pos = end + 1
    return s
  }
  const top = (): PickleValue => {
    const v = stack[stack.length - 1]
    if (v === undefined || v === MARK) throw new Error('pickle: empty stack')
    return v
  }
  const pop = (): PickleValue => {
    const v = stack.pop()
    if (v === undefined || v === MARK) throw new Error('pickle: empty stack')
    return v
  }
  const popMark = (): PickleValue[] => {
    const idx = stack.lastIndexOf(MARK)
    if (idx < 0) throw new Error('pickle: mark not found')
    const items = stack.splice(idx) as PickleValue[]
    items.shift()
    return items
  }

  for (;;) {
    const op = u8()
    switch (op) {
      case 0x80: // PROTO
        u8()
        break
      case 0x95: // FRAME
        bytes(8)
        break
      case 0x2e: // STOP
        return pop()
      case 0x28: // MARK
        stack.push(MARK)
        break
      case 0x4e: // NONE
        stack.push(null)
        break
      case 0x88: // NEWTRUE
        stack.push(true)
        break
      case 0x89: // NEWFALSE
        stack.push(false)
        break
      case 0x4b: // BININT1
        stack.push(u8())
        break
      case 0x4d: // BININT2
        stack.push(u16())
        break
      case 0x4a: // BININT
        stack.push(i32())
        break
      case 0x49: // INT (text)
        stack.push(parseTextInt(line()))
        break
      case 0x4c: // LONG (text)
        stack.push(BigInt(line().replace(/L$/, '')))
        break
      case 0x8a: // LONG1
        stack.push(decodeLong(bytes(u8())))
        break
      case 0x8b: // LONG4
        stack.push(decodeLong(bytes(u32())))
        break
      case 0x55: // SHORT_BINSTRING (py2 str)
      case 0x43: // SHORT_BINBYTES
        stack.push(bytes(u8()))
        break
      case 0x54: // BINSTRING (py2 str)
      case 0x42: // BINBYTES
        stack.push(bytes(u32()))
        break
      case 0x8c: // SHORT_BINUNICODE
        stack.push(new TextDecoder().decode(bytes(u8())))
        break
      case 0x58: // BINUNICODE
        stack.push(new TextDecoder().decode(bytes(u32())))
        break
      case 0x29: // EMPTY_TUPLE
      case 0x5d: // EMPTY_LIST
        stack.push([])
        break
      case 0x85: // TUPLE1
        stack.push([pop()])
        break
      case 0x86: {
        // TUPLE2
        const b = pop()
        const a = pop()
        stack.push([a, b])
        break
      }
      case 0x87: {
        // TUPLE3
        const c = pop()
        const b = pop()
        const a = pop()
        stack.push([a, b, c])
        break
      }
      case 0x74: // TUPLE
      case 0x6c: // LIST
        stack.push(popMark())
        break
      case 0x61: {
        // APPEND
        const v = pop()
        ;(top() as PickleValue[]).push(v)
        break
      }
      case 0x65: {
        // APPENDS
        const items = popMark()
        ;(top() as PickleValue[]).push(...items)
        break
      }
      case 0x71: // BINPUT
        memo.set(u8(), top())
        break
      case 0x72: // LONG_BINPUT
        memo.set(u32(), top())
        break
      case 0x94: // MEMOIZE
        memo.set(memo.size, top())
        break
      case 0x68: // BINGET
      case 0x6a: {
        // LONG_BINGET
        const key = op === 0x68 ? u8() : u32()
        const v = memo.get(key)
        if (v === undefined) throw new Error('pickle: memo miss')
        stack.push(v)
        break
      }
      default:
        throw new Error(`pickle: unsupported opcode 0x${op.toString(16)} at ${pos - 1}`)
    }
  }
}

function parseTextInt(s: string): PickleValue {
  if (s === '00') return false
  if (s === '01') return true
  return BigInt(s)
}

/** Little-endian two's-complement integer. */
function decodeLong(b: Uint8Array): bigint {
  if (b.length === 0) return 0n
  let n = 0n
  for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(b[i])
  if (b[b.length - 1] & 0x80) n -= 1n << BigInt(b.length * 8)
  return n
}
