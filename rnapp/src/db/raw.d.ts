// Metro 以 ?raw 后缀把文本文件作为字符串导入；此处为 TS 提供类型声明
// （全局 augment，匹配所有 `*.sql?raw` / `*.txt?raw` 等）。

// 声明 SQL 文本导入
declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}