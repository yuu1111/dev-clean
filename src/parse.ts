/**
 * @description ポート指定文字列をパースして番号配列に展開
 * @param input - ポート指定("3000", "3000-3005", "3000,5173"等)
 * @returns ポート番号の配列
 */
export function parsePorts(input: string): number[] {
  const ports: number[] = [];
  const segments = input.split(",");

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (trimmed.includes("-")) {
      const dashIdx = trimmed.indexOf("-");
      const startStr = trimmed.slice(0, dashIdx).trim();
      const endStr = trimmed.slice(dashIdx + 1).trim();
      const start = parseStrictInt(startStr);
      const end = parseStrictInt(endStr);
      if (Number.isNaN(start) || Number.isNaN(end))
        throw new Error(`Invalid port range: ${trimmed}`);
      if (start > end) throw new Error(`Invalid port range: ${trimmed}`);
      if (end - start + 1 > 1000) throw new Error(`Port range too large (max 1000): ${trimmed}`);
      for (let p = start; p <= end; p++) {
        validatePort(p);
        ports.push(p);
      }
    } else {
      const p = parseStrictInt(trimmed);
      validatePort(p);
      ports.push(p);
    }
  }
  return ports;
}

/**
 * @description 文字列を厳密に整数パースする(先頭ゼロ・符号・小数点等を拒否)
 * @param s - パース対象の文字列
 * @returns パースされた整数
 */
function parseStrictInt(s: string): number {
  if (!/^[1-9]\d*$/.test(s)) throw new Error(`Invalid port: ${s}`);
  return parseInt(s, 10);
}

/**
 * @description ポート番号が有効範囲内か検証
 * @param p - ポート番号
 * @throws 範囲外の場合
 */
function validatePort(p: number): void {
  if (p < 1 || p > 65535) throw new Error(`Port out of range (1-65535): ${p}`);
}
