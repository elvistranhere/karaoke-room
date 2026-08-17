// Both hosts of the token and search endpoints read the same variable names, but
// Next reads them off `process.env` while a PartyKit worker reads `room.env`
// (unenv gives the worker an empty `process.env`, so it is never the source there).
export type EnvReader = (name: string) => string | undefined;

export function processEnvReader(): EnvReader {
  return (name) => process.env[name];
}

export function recordEnvReader(env: Record<string, unknown>): EnvReader {
  return (name) => {
    const value = env[name];
    return typeof value === "string" && value ? value : undefined;
  };
}
