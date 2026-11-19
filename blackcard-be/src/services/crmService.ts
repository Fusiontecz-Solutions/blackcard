import axios from "axios";
import FormData from "form-data";

export async function pushToCRM(
  pdfBuffer: Buffer,
  filename: string
): Promise<void> {

  const form = new FormData();

  form.append("file", pdfBuffer, {
    filename: filename,
    contentType: "application/pdf",
  });

  await axios.post(
    `${process.env.CRM_API_URL!}/single`,
    form,
    {
      headers: form.getHeaders(),
    }
  );
}

export async function pushMultipleToCRM(
  files: { buffer: Buffer; filename: string }[]
): Promise<void> {

  const form = new FormData();

  files.forEach((file) => {
    form.append("files", file.buffer, {
      filename: file.filename,
      contentType: "application/pdf",
    });
  });

  await axios.post(
    `${process.env.CRM_API_URL!}/multiple`,
    form,
    {
      headers: form.getHeaders(),
    }
  );
}