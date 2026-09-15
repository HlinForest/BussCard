declare module 'sql.js' {
  const initSqlJs: (options?: { locateFile?: (file: string) => string }) => Promise<any>;
  export default initSqlJs;
}
