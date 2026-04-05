export const Uri = {
  parse: (value: string) => ({ scheme: 'parsed', path: value }),
  file: (value: string) => ({ scheme: 'file', path: value }),
};

export const commands = {
  executeCommand: async () => undefined,
};
