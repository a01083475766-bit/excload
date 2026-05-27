declare module 'adm-zip' {
  export interface IZipEntry {
    entryName: string;
    isDirectory: boolean;
    getData(password?: string): Buffer;
  }

  export default class AdmZip {
    constructor(buffer?: Buffer);
    getEntries(): IZipEntry[];
    readFile(entry: IZipEntry): Buffer;
  }
}
