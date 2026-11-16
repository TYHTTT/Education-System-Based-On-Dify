export interface BatchStudent {
  line: number;
  source: string;
  payload: { display_name: string; username: string; password: string };
}

export function parseStudentBatch(input: string): {
  students: BatchStudent[];
  errors: string[];
} {
  const students: BatchStudent[] = [];
  const errors: string[] = [];
  const usernames = new Map<string, number>();

  input.split(/\r?\n/).forEach((source, index) => {
    if (!source.trim()) return;
    const line = index + 1;
    const fields = source.split(",");
    if (fields.length !== 3) {
      errors.push(
        `第 ${line} 行：请按“学生姓名,用户名,密码”填写，使用英文逗号分隔三个字段。`,
      );
      return;
    }
    const [name, account, password] = fields;
    const display_name = name.trim();
    const username = account.trim();
    if (!display_name || [...display_name].length > 64) {
      errors.push(`第 ${line} 行：学生姓名须为 1–64 个字符。`);
    }
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
      errors.push(
        `第 ${line} 行：用户名须为 3–32 位，仅支持英文字母、数字、下划线、点或连字符。`,
      );
    }
    const length = [...password].length;
    if (length < 8 || length > 128) {
      errors.push(`第 ${line} 行：密码须为 8–128 个字符。`);
    }
    const normalized = username.toLowerCase();
    const previous = usernames.get(normalized);
    if (previous !== undefined) {
      errors.push(`第 ${line} 行：用户名与第 ${previous} 行重复。`);
    } else {
      usernames.set(normalized, line);
    }
    students.push({
      line,
      source,
      payload: { display_name, username, password },
    });
  });
  if (!students.length && !errors.length)
    errors.push("请至少填写一名学生的信息。");
  return { students, errors };
}
