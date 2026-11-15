export function splitNames(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function parseBatchNames(value: string, kind: string): string[] {
  const names = splitNames(value);
  if (!names.length) throw new Error(`请输入${kind}名称，每行一个。`);
  if (names.length > 200) throw new Error(`一次最多新增 200 个${kind}。`);
  const tooLong = names.findIndex((name) => name.length > 100);
  if (tooLong >= 0)
    throw new Error(`第 ${tooLong + 1} 项${kind}名称不能超过 100 个字符。`);
  if (new Set(names).size !== names.length)
    throw new Error("名称有重复，请删除重复行。");
  return names;
}
