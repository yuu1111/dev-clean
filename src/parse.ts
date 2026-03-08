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
      const [startStr, endStr] = trimmed.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (Number.isNaN(start) || Number.isNaN(end))
        throw new Error(`Invalid port range: ${trimmed}`);
      if (start > end) throw new Error(`Invalid port range: ${trimmed}`);
      if (end - start + 1 > 1000) throw new Error(`Port range too large (max 1000): ${trimmed}`);
      for (let p = start; p <= end; p++) {
        validatePort(p);
        ports.push(p);
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (Number.isNaN(p)) throw new Error(`Invalid port: ${trimmed}`);
      validatePort(p);
      ports.push(p);
    }
  }
  return ports;
}

/**
 * @description ポート番号が有効範囲内か検証
 * @param p - ポート番号
 * @throws 範囲外の場合
 */
function validatePort(p: number): void {
  if (p < 1 || p > 65535) throw new Error(`Port out of range (1-65535): ${p}`);
}
