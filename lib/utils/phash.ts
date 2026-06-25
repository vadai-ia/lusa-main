export const HAMMING_THRESHOLD = 10

export function hammingDistance(hex1: string, hex2: string): number {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) return Infinity
  let dist = 0
  for (let i = 0; i < hex1.length; i++) {
    let xor = (parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16))
    while (xor) { dist += xor & 1; xor >>= 1 }
  }
  return dist
}
