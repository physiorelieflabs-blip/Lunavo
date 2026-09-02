export type MerchantExport = 'customers' | 'orders' | 'products' | 'transactions';

export async function downloadMerchantExport(resource: MerchantExport) {
  const response = await fetch(`/api/exports/${resource}`, { credentials: 'include' });
  if (!response.ok) throw new Error(`Export failed with status ${response.status}`);
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `ts-commerce-${resource}.csv`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}