import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStudentBatch } from "../lib/student-batch.ts";

test("parses English commas, ignores blank lines, and keeps original line numbers", () => {
  const batch = parseStudentBatch(
    "\r\n 张三 , student_001 ,InitialPass123\r\n \r\n李四,student_002,InitialPass456\r\n",
  );
  assert.deepEqual(batch.errors, []);
  assert.deepEqual(
    batch.students.map((row) => row.line),
    [2, 4],
  );
  assert.deepEqual(
    batch.students.map((row) => row.payload),
    [
      {
        display_name: "张三",
        username: "student_001",
        password: "InitialPass123",
      },
      {
        display_name: "李四",
        username: "student_002",
        password: "InitialPass456",
      },
    ],
  );
});

test("rejects Chinese delimiters, missing fields, and extra comma-separated fields", () => {
  for (const source of [
    "张三，student_001，InitialPass123",
    "张三,student_001",
    "张三,student_001,Initial,Pass123",
  ]) {
    const batch = parseStudentBatch(source);
    assert.equal(batch.errors.length, 1);
    assert.match(batch.errors[0], /第 1 行.*英文逗号/);
  }
});

test("checks field lengths and username characters without revealing passwords", () => {
  const secret = "sensitive-password";
  for (const source of [
    `,student_001,${secret}`,
    `${"名".repeat(65)},student_001,${secret}`,
    `张三,ab,${secret}`,
    `张三,${"a".repeat(33)},${secret}`,
    `张三,bad#name,${secret}`,
    "张三,student_001,short",
    `张三,student_001,${"p".repeat(129)}`,
    "张三,student_001,😀😀😀😀",
  ]) {
    const batch = parseStudentBatch(source);
    assert(batch.errors.length > 0);
    assert(!batch.errors.join().includes(secret));
  }
  assert.deepEqual(
    parseStudentBatch(`${"名".repeat(64)},a_.-1,${"p".repeat(128)}`).errors,
    [],
  );
});

test("detects case-insensitive duplicate usernames using original line numbers", () => {
  const batch = parseStudentBatch(
    "张三,Student_001,InitialPass123\n\n李四,student_001,InitialPass456",
  );
  assert.deepEqual(batch.errors, ["第 3 行：用户名与第 1 行重复。"]);
});

test("preserves password whitespace and source rows for retry", () => {
  const source = " 张三 , student_001 ,  secret-password  ";
  const batch = parseStudentBatch(source);
  assert.deepEqual(batch.errors, []);
  assert.equal(batch.students[0].source, source);
  assert.equal(batch.students[0].payload.password, "  secret-password  ");
});

test("empty and whitespace-only submissions need at least one student", () => {
  for (const source of ["", "  \n\r\n\t"]) {
    const batch = parseStudentBatch(source);
    assert.equal(batch.students.length, 0);
    assert.deepEqual(batch.errors, ["请至少填写一名学生的信息。"]);
  }
});
