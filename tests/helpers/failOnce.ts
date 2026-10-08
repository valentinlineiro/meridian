// Wraps a D1 so the first statement touching `table` fails once, like a transient D1 error.
export function failOnceOn(d1: D1Database, table: string): D1Database {
  let armed = true;
  return {
    ...(d1 as any),
    batch: (d1 as any).batch.bind(d1),
    prepare(sql: string) {
      const st = (d1 as any).prepare(sql);
      if (!sql.includes(`INTO ${table}`)) return st;
      const wrap = (s: any): any => ({
        ...s,
        bind: (...a: any[]) => wrap(s.bind(...a)),
        run: async () => {
          if (armed) { armed = false; throw new Error("transient D1 error"); }
          return s.run();
        },
      });
      return wrap(st);
    },
  } as D1Database;
}
