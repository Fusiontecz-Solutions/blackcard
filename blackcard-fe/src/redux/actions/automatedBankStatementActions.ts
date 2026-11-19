import { createAsyncThunk } from '@reduxjs/toolkit';
import { axiosPost, axiosPostFormData } from '../axios';

// 🔵 Automated Bank Statement Upload (uses Express router with multer.single("file"))
export const uploadBankStatement = createAsyncThunk(
  'automatedBankStatement/upload',
  async (file: File, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      // Backend expects field name "file"
      formData.append('file', file);

      // Adjust base path if your router is mounted under a different prefix
      const response = await axiosPostFormData(
        '/automatedbankstatement/upload-statement',
        formData,
      );
      return response.data;
    } catch (error: any) {
      console.error('Upload bank statement error:', error);
      return rejectWithValue(
        error.response?.data?.message ||
        'Failed to upload and parse bank statement',
      );
    }
  },
);

// 🔵 Upload statement and download parsed CSV (returns CSV text)
export const uploadAndDownloadCsv = createAsyncThunk(
  'automatedBankStatement/uploadAndDownloadCsv',
  async (file: File, { rejectWithValue }) => {
    try {
      const formData = new FormData();
      // Backend expects field name "file"
      formData.append('file', file);

      const baseName = file?.name?.replace(/\.[^/.]+$/, '') || 'bank-statement';
      const filename = `${baseName}-transactions.csv`;

      const response = await axiosPost(
        '/automatedbankstatement/upload-statement/download-csv',
        formData,
        {
          // Server responds with `text/csv; charset=utf-8`
          responseType: 'text',
          timeout: 120000,
        },
      );

      return { csvContent: response.data, filename };
    } catch (error: any) {
      console.error('Upload & download CSV error:', error);
      return rejectWithValue(
        error.response?.data?.message || error?.message || 'Failed to upload and download CSV',
      );
    }
  },
);


