/** UTS 原生模块的类型垫片（HBuilderX 内由真实 .uts 提供，此处仅过 tsc；真机走 uts.ts 绑定）。 */
declare module '*.uts.js' {
  const m: any;
  export = m;
}

