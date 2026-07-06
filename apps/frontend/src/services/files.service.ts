import { api } from './api';

export interface UploadedFileRecord {
  id: string;
  name: string;
}

export async function uploadFile(file: File): Promise<UploadedFileRecord> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<UploadedFileRecord>('/files/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
