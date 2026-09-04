import { customFetch } from '@workspace/api-client-react';

export type MerchantExport = 'customers' | 'orders' | 'products' | 'transactions';

export async function downloadMerchantExport(resource: MerchantExport) {
  const response = await customFetch<Blob>(`/api/exports/${resource}`, {
    credentials: 'include',
    responseType: 'blob',
  });
  const blob = response;
  const filename = `ts-commerce-${resource}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}