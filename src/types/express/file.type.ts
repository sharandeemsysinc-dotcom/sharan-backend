export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;     // for memoryStorage
  destination?: string;
  filename?: string;
  path?: string;
}
