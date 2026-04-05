export const Uri = {
  parse: (value: string) => ({ scheme: 'parsed', path: value }),
  file: (value: string) => ({ scheme: 'file', path: value }),
};

export const commands = {
  executeCommand: () => Promise.resolve(undefined),
};

export const window = {
  tabGroups: {
    all: [],
    close: () => Promise.resolve(undefined),
  },
};

export const workspace = {
  openTextDocument: () => Promise.resolve({
    save: () => Promise.resolve(true),
  }),
};

export class TabInputText {
  uri: any;
  constructor(uri: any) {
    this.uri = uri;
  }
}
